import { requireEnv } from "@/lib/env";

import { PlatformApiError, PlatformAuthError } from "./errors";
import type { ConnectionTokens, PlatformAdapter, PublishResult } from "./types";

// YouTube Data API v3 — single-video uploads via the resumable protocol.
//
// Pre-audit reality (CLAUDE.md platform table): every upload from an
// unverified API project is locked to PRIVATE with no per-video appeal. The
// adapter works end to end regardless; the Phase 5 audit is what makes the
// results public. Two more gates the audit form also covers: Google OAuth app
// verification (all YouTube scopes are "sensitive" — unverified apps cap at
// 100 lifetime grants) and the default quota of 100 uploads/day per project,
// shared across every MarkedFox user.
//
// Unlike every other adapter, YouTube cannot pull media from a URL: the
// server streams the bytes from R2 through the resumable PUT itself. On the
// 2GB box that must stay a stream, never a buffer.

const AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/youtube/v3";
const UPLOAD = "https://www.googleapis.com/upload/youtube/v3/videos";

// youtube.upload alone cannot call channels.list (verified against the API
// discovery document) — the readonly scope rides along for identity. Keep the
// pair minimal: every extra sensitive scope is another thing to justify in
// OAuth verification.
const OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];

type GoogleError = {
  error?:
    | { code?: number; message?: string; errors?: { reason?: string }[] }
    | string;
  error_description?: string;
};

function errorParts(body: GoogleError, status: number): { detail: string; reason: string } {
  if (typeof body.error === "string") {
    return { detail: body.error_description ?? body.error, reason: body.error };
  }
  return {
    detail: body.error?.message ?? `HTTP ${status}`,
    reason: body.error?.errors?.[0]?.reason ?? "",
  };
}

async function google<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await response.json().catch(() => ({}))) as T & GoogleError;

  if (!response.ok) {
    const { detail, reason } = errorParts(body, response.status);
    // invalid_grant = revoked/expired refresh token; 401 = dead access token.
    if (response.status === 401 || reason === "invalid_grant") {
      throw new PlatformAuthError("youtube", detail);
    }
    // quotaExceeded is terminal for the day (resets midnight Pacific) — do
    // not mark it retryable, backoff cannot fix an exhausted daily bucket.
    const retryable = response.status >= 500 || response.status === 429;
    throw new PlatformApiError("youtube", detail, retryable);
  }
  return body;
}

async function tokenCall(params: Record<string, string>): Promise<ConnectionTokens> {
  const out = await google<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  }>(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      ...params,
    }).toString(),
  });
  return {
    accessToken: out.access_token,
    refreshToken: out.refresh_token,
    expiresAt: out.expires_in
      ? new Date(Date.now() + out.expires_in * 1000)
      : undefined,
    scopes: out.scope ? out.scope.split(" ") : OAUTH_SCOPES,
  };
}

// snippet.title takes 100 chars and neither field accepts < or >.
function sanitize(text: string): string {
  return text.replace(/[<>]/g, "");
}

function titleFrom(caption: string): string {
  const firstLine = sanitize(caption).split("\n")[0]?.trim() ?? "";
  const title = Array.from(firstLine).slice(0, 100).join("");
  return title || "New video";
}

export const youtube: PlatformAdapter = {
  id: "youtube",
  displayName: "YouTube",
  requiredEnv: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  refreshPolicy: "on-use",
  capabilities: {
    text: false,
    image: false, // video-only surface
    video: true,
    carousel: false,
    schedule: true,
    analytics: false,
  },

  // The description limit is 5000 BYTES of UTF-8, not characters — the
  // validator counts code points, so publish() re-checks bytes and refuses
  // with a clear message rather than letting Google reject the upload after
  // the fact.
  rules: {
    captionMaxChars: 5000,
    mediaMax: 1,
    maxVideos: 1,
    mixedMediaAllowed: false,
    hashtagMax: null,
  },

  getAuthorizeUrl({ redirectUri, state }) {
    const url = new URL(AUTHORIZE);
    url.searchParams.set("client_id", requireEnv("GOOGLE_CLIENT_ID"));
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", OAUTH_SCOPES.join(" "));
    url.searchParams.set("state", state);
    // Both required for a refresh token on every connect, not just the first:
    // without prompt=consent, a returning user gets no refresh_token at all.
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    return url.toString();
  },

  async connect({ code, redirectUri }) {
    const tokens = await tokenCall({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });

    const channels = await google<{
      items?: { id: string; snippet?: { title?: string } }[];
    }>(`${API}/channels?part=snippet&mine=true`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });

    const channel = channels.items?.[0];
    if (!channel) {
      // A Google account with no YouTube channel cannot upload — say so now,
      // at connect, not at first publish.
      throw new PlatformApiError(
        "youtube",
        "This Google account has no YouTube channel. Create one on youtube.com, then connect again.",
      );
    }

    return {
      tokens,
      accounts: [
        {
          platformAccountId: channel.id,
          platformAccountName: channel.snippet?.title,
          metadata: {},
        },
      ],
    };
  },

  // Google refresh tokens do NOT rotate — the same one keeps working, so it
  // is carried through unchanged. It dies only on revocation, 6 months of
  // non-use, or (testing-status apps) 7 days.
  async refresh(tokens) {
    if (!tokens.refreshToken) {
      throw new PlatformAuthError("youtube", "no refresh token stored — reconnect this account");
    }
    const fresh = await tokenCall({
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
    });
    return { ...fresh, refreshToken: tokens.refreshToken };
  },

  async publish({ caption, media, tokens }): Promise<PublishResult> {
    const video = media.find((m) => m.type === "video");
    if (!video || media.length !== 1) {
      throw new PlatformApiError("youtube", "YouTube takes exactly one video per post");
    }

    const description = sanitize(caption);
    const bytes = Buffer.byteLength(description, "utf8");
    if (bytes > 5000) {
      throw new PlatformApiError(
        "youtube",
        `description is ${bytes} bytes; YouTube allows 5000 (multi-byte characters count more than one)`,
      );
    }

    // Fetch the media stream first so its size and type can be declared in
    // the session initiation — Google requires both up front.
    const source = await fetch(video.url, {
      signal: AbortSignal.timeout(60_000),
    });
    if (!source.ok || !source.body) {
      throw new PlatformApiError(
        "youtube",
        `could not fetch media from storage: HTTP ${source.status}`,
        true,
      );
    }
    const size = source.headers.get("content-length");
    const mime = video.mime ?? source.headers.get("content-type") ?? "video/mp4";

    // Step 1: open a resumable session; its URI arrives in Location.
    const session = await fetch(`${UPLOAD}?uploadType=resumable&part=snippet,status`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        ...(size ? { "X-Upload-Content-Length": size } : {}),
        "X-Upload-Content-Type": mime,
      },
      body: JSON.stringify({
        snippet: { title: titleFrom(caption), description },
        // Public is the intent; unverified API projects get silently forced
        // to private by YouTube until the Phase 5 audit passes.
        status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!session.ok) {
      const body = (await session.json().catch(() => ({}))) as GoogleError;
      const { detail, reason } = errorParts(body, session.status);
      if (session.status === 401) throw new PlatformAuthError("youtube", detail);
      throw new PlatformApiError(
        "youtube",
        reason === "quotaExceeded"
          ? "YouTube's daily upload quota is exhausted — try again tomorrow"
          : detail,
        session.status >= 500,
      );
    }
    const sessionUri = session.headers.get("location");
    if (!sessionUri) {
      throw new PlatformApiError("youtube", "upload session opened but no session URI returned");
    }

    // Step 2: stream the bytes. One PUT of the whole file; a failure mid-way
    // surfaces as a retryable error and the retry restarts the session. No
    // overall timeout here — a large video legitimately takes minutes.
    const upload = await fetch(sessionUri, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        "Content-Type": mime,
        ...(size ? { "Content-Length": size } : {}),
      },
      body: source.body,
      // Node's fetch requires half-duplex for streaming request bodies;
      // TypeScript's RequestInit does not know the field yet.
      ...( { duplex: "half" } as object),
    });
    const result = (await upload.json().catch(() => ({}))) as {
      id?: string;
    } & GoogleError;

    if (!upload.ok || !result.id) {
      const { detail } = errorParts(result, upload.status);
      if (upload.status === 401) throw new PlatformAuthError("youtube", detail);
      throw new PlatformApiError("youtube", detail, true);
    }

    return {
      platformPostId: result.id,
      url: `https://www.youtube.com/watch?v=${result.id}`,
    };
  },
};
