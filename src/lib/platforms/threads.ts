import { requireEnv } from "@/lib/env";

import { PlatformApiError, PlatformAuthError } from "./errors";
import type {
  ConnectionTokens,
  PlatformAdapter,
  PublishResult,
} from "./types";

// Threads.
//
// Despite the shared branding, this is NOT the Facebook Graph API. Meta's docs
// are explicit: Threads has its own host (graph.threads.net), its own OAuth
// endpoints, its own app credentials, and its own scopes. A Facebook Page token
// is useless here. Hence a separate adapter rather than a branch inside the
// Instagram one.
//
// Owner setup: add the Threads API product to the Meta app, then put the
// Threads app id and secret in the environment. They are DIFFERENT values from
// META_APP_ID / META_APP_SECRET.

const API = "https://graph.threads.net/v1.0";
const AUTH = "https://threads.net/oauth/authorize";

const OAUTH_SCOPES = ["threads_basic", "threads_content_publish"];

// Threads publishes through a container, like Instagram: create, then publish.
// Text posts are ready immediately; media needs a moment to process.
const CONTAINER_POLL_ATTEMPTS = 20;
const CONTAINER_POLL_DELAY_MS = 3000;

type ThreadsError = { error?: { message?: string; code?: number; type?: string } };

async function threads<T>(
  path: string,
  init?: RequestInit & { searchParams?: Record<string, string>; base?: string },
): Promise<T> {
  const url = new URL(`${init?.base ?? API}${path}`);
  for (const [key, value] of Object.entries(init?.searchParams ?? {})) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    method: init?.method ?? "GET",
    headers: init?.headers,
    body: init?.body,
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await response.json().catch(() => ({}))) as T & ThreadsError;

  if (!response.ok || body.error) {
    const err = body.error;
    const detail = err?.message ?? `HTTP ${response.status}`;
    if (err?.code === 190 || err?.type === "OAuthException") {
      throw new PlatformAuthError("threads", detail);
    }
    const retryable = response.status >= 500 || [4, 17, 32].includes(err?.code ?? -1);
    throw new PlatformApiError("threads", detail, retryable);
  }
  return body;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Threads long-lived tokens last 60 days and are refreshed by their own
// endpoint — not by fb_exchange_token, which belongs to the Facebook graph.
async function toLongLived(shortToken: string): Promise<ConnectionTokens> {
  const out = await threads<{ access_token: string; expires_in?: number }>(
    "/access_token",
    {
      searchParams: {
        grant_type: "th_exchange_token",
        client_secret: requireEnv("THREADS_APP_SECRET"),
        access_token: shortToken,
      },
    },
  );
  return {
    accessToken: out.access_token,
    expiresAt: out.expires_in
      ? new Date(Date.now() + out.expires_in * 1000)
      : undefined,
    scopes: OAUTH_SCOPES,
  };
}

export const threadsAdapter: PlatformAdapter = {
  id: "threads",
  displayName: "Threads",
  capabilities: {
    text: true, // Threads is text-first, unlike Instagram
    image: true,
    video: true,
    carousel: true,
    schedule: true,
    analytics: true,
  },

  getAuthorizeUrl({ redirectUri, state }) {
    const url = new URL(AUTH);
    url.searchParams.set("client_id", requireEnv("THREADS_APP_ID"));
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", OAUTH_SCOPES.join(","));
    return url.toString();
  },

  async connect({ code, redirectUri }) {
    // Token exchange is a POST with form encoding here, not a GET with query
    // params the way the Facebook graph does it.
    const form = new URLSearchParams({
      client_id: requireEnv("THREADS_APP_ID"),
      client_secret: requireEnv("THREADS_APP_SECRET"),
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code,
    });
    const short = await threads<{ access_token: string; user_id: string }>(
      "/oauth/access_token",
      {
        base: "https://graph.threads.net",
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      },
    );

    const tokens = await toLongLived(short.access_token);

    const me = await threads<{ id: string; username?: string }>("/me", {
      searchParams: { fields: "id,username", access_token: tokens.accessToken },
    });

    // One Threads login is one Threads account — no Page fan-out to do.
    return {
      tokens,
      accounts: [
        {
          platformAccountId: me.id,
          platformAccountName: me.username,
          metadata: {},
        },
      ],
    };
  },

  async refresh(tokens) {
    const out = await threads<{ access_token: string; expires_in?: number }>(
      "/refresh_access_token",
      {
        searchParams: {
          grant_type: "th_refresh_token",
          access_token: tokens.accessToken,
        },
      },
    );
    return {
      accessToken: out.access_token,
      expiresAt: out.expires_in
        ? new Date(Date.now() + out.expires_in * 1000)
        : undefined,
      scopes: OAUTH_SCOPES,
    };
  },

  async publish({ caption, media, tokens, platformAccountId }) {
    const token = tokens.accessToken;

    const createContainer = async (
      params: Record<string, string>,
    ): Promise<string> => {
      const c = await threads<{ id: string }>(`/${platformAccountId}/threads`, {
        method: "POST",
        searchParams: { ...params, access_token: token },
      });
      return c.id;
    };

    let containerId: string;

    if (media.length === 0) {
      containerId = await createContainer({ media_type: "TEXT", text: caption });
    } else if (media.length === 1) {
      const item = media[0];
      containerId = await createContainer(
        item.type === "video"
          ? { media_type: "VIDEO", video_url: item.url, text: caption }
          : { media_type: "IMAGE", image_url: item.url, text: caption },
      );
    } else {
      const children: string[] = [];
      for (const item of media.slice(0, 20)) {
        children.push(
          await createContainer(
            item.type === "video"
              ? {
                  media_type: "VIDEO",
                  video_url: item.url,
                  is_carousel_item: "true",
                }
              : {
                  media_type: "IMAGE",
                  image_url: item.url,
                  is_carousel_item: "true",
                },
          ),
        );
      }
      containerId = await createContainer({
        media_type: "CAROUSEL",
        children: children.join(","),
        text: caption,
      });
    }

    // Media containers need processing time; text is ready at once. Poll either
    // way so there is one code path.
    if (media.length > 0) {
      for (let i = 0; i < CONTAINER_POLL_ATTEMPTS; i++) {
        const status = await threads<{ status?: string }>(`/${containerId}`, {
          searchParams: { fields: "status", access_token: token },
        });
        if (status.status === "FINISHED") break;
        if (status.status === "ERROR" || status.status === "EXPIRED") {
          throw new PlatformApiError(
            "threads",
            `media container ${status.status?.toLowerCase()} (check the media URL and format)`,
          );
        }
        await sleep(CONTAINER_POLL_DELAY_MS);
      }
    }

    const published = await threads<{ id: string }>(
      `/${platformAccountId}/threads_publish`,
      {
        method: "POST",
        searchParams: { creation_id: containerId, access_token: token },
      },
    );

    const result: PublishResult = { platformPostId: published.id };
    try {
      const post = await threads<{ permalink?: string }>(`/${published.id}`, {
        searchParams: { fields: "permalink", access_token: token },
      });
      if (post.permalink) result.url = post.permalink;
    } catch {
      // Published fine; a missing permalink is not worth failing over.
    }
    return result;
  },
};
