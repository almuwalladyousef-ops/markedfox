import { requireEnv } from "@/lib/env";

import { PlatformApiError, PlatformAuthError } from "./errors";
import type {
  AccountInsights,
  AccountMediaItem,
  AccountProfile,
  ConnectedAccount,
  ConnectionTokens,
  PlatformAdapter,
  PublishResult,
} from "./types";
import { optionValue } from "./publish-options";

// Facebook Pages, on the same Meta app as Instagram.
//
// This is the cheapest adapter in the registry: the OAuth dialog, the token
// exchange, and the /me/accounts discovery are identical to Instagram's — the
// Instagram flow already collects the Page and its token, it just throws the
// Page away and keeps the linked Instagram account. Here we keep the Page.
//
// What differs is publishing. Instagram is a two-step container flow; a Page
// takes a single POST to /{page-id}/feed or /{page-id}/photos. Video wants
// /{page-id}/videos.

const GRAPH_VERSION = "v26.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

// pages_manage_posts is the one scope Instagram does not need. Everything else
// is shared, so a user who connects both sees one consent screen.
const OAUTH_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "business_management",
];

type GraphError = { error?: { message?: string; type?: string; code?: number } };

async function graph<T>(
  path: string,
  init?: RequestInit & { searchParams?: Record<string, string> },
): Promise<T> {
  const url = new URL(`${GRAPH}${path}`);
  for (const [key, value] of Object.entries(init?.searchParams ?? {})) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    method: init?.method ?? "GET",
    headers: init?.headers,
    body: init?.body,
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await response.json().catch(() => ({}))) as T & GraphError;

  if (!response.ok || body.error) {
    const err = body.error;
    const detail = err?.message ?? `HTTP ${response.status}`;
    if (err?.code === 190 || err?.type === "OAuthException") {
      throw new PlatformAuthError("facebook", detail);
    }
    const retryable =
      response.status >= 500 || [4, 17, 32, 613].includes(err?.code ?? -1);
    throw new PlatformApiError("facebook", detail, retryable);
  }
  return body;
}

function expiryFrom(seconds: number | undefined): Date | undefined {
  return seconds ? new Date(Date.now() + seconds * 1000) : undefined;
}

async function exchangeForLongLived(token: string): Promise<ConnectionTokens> {
  const out = await graph<{ access_token: string; expires_in?: number }>(
    "/oauth/access_token",
    {
      searchParams: {
        grant_type: "fb_exchange_token",
        client_id: requireEnv("META_APP_ID"),
        client_secret: requireEnv("META_APP_SECRET"),
        fb_exchange_token: token,
      },
    },
  );
  return {
    accessToken: out.access_token,
    expiresAt: expiryFrom(out.expires_in),
    scopes: OAUTH_SCOPES,
  };
}

// The Page as its own audience sees it. Reactions and comments come back as
// summary counts on the same call as the posts, so the whole grid is one
// request rather than one per post — which matters because Meta rate-limits
// per app and every MarkedFox user shares that budget.
const facebookInsights: AccountInsights = {
  primaryMetric: "likes",
  metered: false,
  requiredScopes: ["pages_read_engagement"],

  async readProfile({ tokens, platformAccountId }) {
    const out = await graph<{
      name?: string;
      username?: string;
      about?: string;
      link?: string;
      followers_count?: number;
      fan_count?: number;
      picture?: { data?: { url?: string } };
    }>(`/${platformAccountId}`, {
      searchParams: {
        fields:
          "name,username,about,link,followers_count,fan_count,picture.type(large)",
        access_token: tokens.accessToken,
      },
    });

    const profile: AccountProfile = {
      handle: out.username,
      displayName: out.name,
      avatarUrl: out.picture?.data?.url,
      bio: out.about,
      profileUrl: out.link ?? `https://www.facebook.com/${platformAccountId}`,
      // A Page has followers and fans and no "following" of its own.
      followers: out.followers_count ?? out.fan_count ?? null,
      following: null,
      postCount: null,
    };
    return profile;
  },

  async listMedia({ tokens, platformAccountId, limit = 36 }) {
    const out = await graph<{
      data?: {
        id: string;
        message?: string;
        created_time?: string;
        permalink_url?: string;
        full_picture?: string;
        attachments?: { data?: { media_type?: string }[] };
        reactions?: { summary?: { total_count?: number } };
        comments?: { summary?: { total_count?: number } };
      }[];
    }>(`/${platformAccountId}/posts`, {
      searchParams: {
        fields:
          "id,message,created_time,permalink_url,full_picture," +
          "attachments{media_type}," +
          "reactions.summary(true).limit(0),comments.summary(true).limit(0)",
        limit: String(Math.min(Math.max(limit, 1), 50)),
        access_token: tokens.accessToken,
      },
    });

    return (out.data ?? []).map((post): AccountMediaItem => {
      const attachment = post.attachments?.data?.[0]?.media_type;
      return {
        externalId: post.id,
        kind:
          attachment === "video"
            ? "video"
            : attachment === "photo" || post.full_picture
              ? "photo"
              : "text",
        caption: post.message,
        permalink: post.permalink_url,
        thumbnailUrl: post.full_picture,
        postedAt: post.created_time,
        views: null,
        likes: post.reactions?.summary?.total_count ?? null,
        comments: post.comments?.summary?.total_count ?? null,
        shares: null,
      };
    });
  },
};

export const facebook: PlatformAdapter = {
  id: "facebook",
  displayName: "Facebook",
  requiredEnv: ["META_APP_ID", "META_APP_SECRET"],
  insights: facebookInsights,
  refreshPolicy: "sweep",
  capabilities: {
    text: true, // unlike Instagram, a Page post needs no media
    image: true,
    video: true,
    carousel: true, // several photos attach to one feed post (publish() below)
    schedule: true,
    analytics: true,
  },

  // A Page post takes up to 63,206 characters. publish() handles either one
  // video or up to ten photos — never both in one post — so that is what the
  // rules promise.
  rules: {
    captionMaxChars: 63206,
    mediaMax: 10,
    maxVideos: 1,
    mixedMediaAllowed: false,
    hashtagMax: null,
  },

  getAuthorizeUrl({ redirectUri, state }) {
    const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
    url.searchParams.set("client_id", requireEnv("META_APP_ID"));
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", OAUTH_SCOPES.join(","));
    return url.toString();
  },

  async connect({ code, redirectUri }) {
    const short = await graph<{ access_token: string }>("/oauth/access_token", {
      searchParams: {
        client_id: requireEnv("META_APP_ID"),
        client_secret: requireEnv("META_APP_SECRET"),
        redirect_uri: redirectUri,
        code,
      },
    });
    const tokens = await exchangeForLongLived(short.access_token);

    // The app-scoped user id is what Meta's deauthorize and data-deletion
    // callbacks identify the person by; Page tokens carry no way back to it,
    // so it is recorded on every connection now. See instagram.ts.
    const me = await graph<{ id: string }>("/me", {
      searchParams: { fields: "id", access_token: tokens.accessToken },
    });

    const out = await graph<{
      data: { id: string; name: string; access_token: string }[];
    }>("/me/accounts?fields=id,name,access_token&limit=50", {
      searchParams: { access_token: tokens.accessToken },
    });

    const accounts: ConnectedAccount[] = (out.data ?? []).map((page) => ({
      platformAccountId: page.id,
      platformAccountName: page.name,
      // Page tokens derived from a long-lived user token do not expire.
      tokens: { accessToken: page.access_token, scopes: OAUTH_SCOPES },
      metadata: { pageName: page.name, metaUserId: me.id },
    }));

    if (accounts.length === 0) {
      throw new PlatformApiError(
        "facebook",
        "This Facebook login manages no Pages. Create a Page first, then connect.",
      );
    }
    return { tokens, accounts };
  },

  async refresh(tokens) {
    return exchangeForLongLived(tokens.accessToken);
  },

  async publish({ caption, media, tokens, platformAccountId, options }) {
    const token = tokens.accessToken;

    // Text-only: the plain feed post, and the reason capabilities.text is true.
    if (media.length === 0) {
      const out = await graph<{ id: string }>(`/${platformAccountId}/feed`, {
        method: "POST",
        searchParams: { message: caption, access_token: token },
      });
      return { platformPostId: out.id, url: `https://facebook.com/${out.id}` };
    }

    const first = media[0];

    if (first.type === "video") {
      const title = optionValue("facebook", options, "title");
      const out = await graph<{ id: string }>(`/${platformAccountId}/videos`, {
        method: "POST",
        searchParams: {
          file_url: first.url,
          description: caption,
          ...(typeof title === "string" && title ? { title } : {}),
          // Only sent to turn it off: Facebook's default is embeddable.
          ...(optionValue("facebook", options, "embeddable") === false
            ? { embeddable: "false" }
            : {}),
          access_token: token,
        },
      });
      return { platformPostId: out.id, url: `https://facebook.com/${out.id}` };
    }

    // Single photo posts directly. Several photos are uploaded unpublished
    // first, then attached to one feed post — Facebook's own multi-photo shape.
    if (media.length === 1) {
      const out = await graph<{ id: string; post_id?: string }>(
        `/${platformAccountId}/photos`,
        {
          method: "POST",
          searchParams: {
            url: first.url,
            caption,
            access_token: token,
          },
        },
      );
      const id = out.post_id ?? out.id;
      return { platformPostId: id, url: `https://facebook.com/${id}` };
    }

    const attached: string[] = [];
    for (const item of media.slice(0, 10)) {
      const photo = await graph<{ id: string }>(
        `/${platformAccountId}/photos`,
        {
          method: "POST",
          searchParams: {
            url: item.url,
            published: "false",
            access_token: token,
          },
        },
      );
      attached.push(photo.id);
    }

    const params: Record<string, string> = {
      message: caption,
      access_token: token,
    };
    attached.forEach((id, i) => {
      params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id });
    });

    const out = await graph<{ id: string }>(`/${platformAccountId}/feed`, {
      method: "POST",
      searchParams: params,
    });
    const result: PublishResult = {
      platformPostId: out.id,
      url: `https://facebook.com/${out.id}`,
    };
    return result;
  },
};
