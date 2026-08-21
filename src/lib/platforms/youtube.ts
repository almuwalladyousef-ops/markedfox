import { fetchMedia, UnsafeMediaUrlError } from "@/lib/media/fetch-guard";
import { requireEnv } from "@/lib/env";

import { PlatformApiError, PlatformAuthError } from "./errors";
import { optionValue } from "./publish-options";
import type {
  ConnectionTokens,
  PlatformAdapter,
  PlatformPublishOptions,
  PublishResult,
} from "./types";

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

/** The user's title if they wrote one, otherwise the caption's first line,
 *  with #shorts appended when asked for — and the 100-character ceiling
 *  applied AFTER the tag, because YouTube truncates and would eat it. */
function youtubeTitle(
  caption: string,
  options: PlatformPublishOptions | undefined,
): string {
  const chosen = optionValue("youtube", options, "title");
  const base =
    typeof chosen === "string" && chosen.trim()
      ? sanitize(chosen.trim())
      : titleFrom(caption);
  if (optionValue("youtube", options, "add_shorts_tag") !== true) {
    return Array.from(base).slice(0, 100).join("");
  }
  const room = 100 - " #shorts".length;
  return `${Array.from(base).slice(0, room).join("").trimEnd()} #shorts`;
}

function youtubeTags(options: PlatformPublishOptions | undefined): string[] {
  const raw = optionValue("youtube", options, "tags");
  if (typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((tag) => sanitize(tag).trim())
    .filter(Boolean)
    .slice(0, 30);
}

// The R2 fetch must answer with headers inside this window; the body is then
// governed by the stall watchdog, not by a clock.
const SOURCE_HEADERS_TIMEOUT_MS = 60_000;
// No bytes from storage for this long means the stream is dead, not slow.
const STREAM_STALL_MS = 120_000;

// Pipes a stream through unchanged while re-arming a timer on every chunk;
// `onStall` fires only if the gap between two chunks exceeds `stallMs`.
export function withStallWatchdog(
  body: ReadableStream<Uint8Array>,
  onStall: () => void,
  stallMs: number,
): ReadableStream<Uint8Array> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(onStall, stallMs);
    // Never the only thing keeping the process alive.
    (timer as { unref?: () => void }).unref?.();
  };
  const disarm = () => {
    if (timer) clearTimeout(timer);
  };
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      start: arm,
      transform(chunk, controller) {
        arm();
        controller.enqueue(chunk);
      },
      flush: disarm,
      // `cancel` is in the Streams spec but not yet in TypeScript's lib; if
      // the consumer cancels mid-stream the timer simply fires into an
      // already-settled fetch, where abort() is a no-op.
      ...({ cancel: disarm } as object),
    }),
  );
}

// One verdict for a failed session-open or PUT. Google's resumable protocol
// reports deterministic refusals as 4xx with a reason — those never improve
// on retry, so only transport-shaped statuses are marked retryable.
export function classifyUploadFailure(status: number, body: GoogleError): Error {
  const { detail, reason } = errorParts(body, status);
  if (status === 401) return new PlatformAuthError("youtube", detail);
  if (reason === "quotaExceeded") {
    return new PlatformApiError(
      "youtube",
      "YouTube's daily upload quota is exhausted — try again tomorrow",
    );
  }
  if (reason === "uploadLimitExceeded") {
    return new PlatformApiError(
      "youtube",
      "this channel has hit YouTube's upload limit for now — try again later",
    );
  }
  const retryable = status >= 500 || status === 408 || status === 429 || status === 308;
  return new PlatformApiError("youtube", detail, retryable);
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

  // Google's revoke endpoint takes either token; revoking the refresh token
  // also invalidates every access token minted from it. Google's OAuth
  // verification reviewers look for exactly this on disconnect.
  async revoke(tokens) {
    const token = tokens.refreshToken ?? tokens.accessToken;
    const response = await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }).toString(),
      signal: AbortSignal.timeout(15_000),
    });
    // 400 here means "already invalid" — which is the state we wanted.
    if (!response.ok && response.status !== 400) {
      throw new PlatformApiError("youtube", `revoke failed: HTTP ${response.status}`, true);
    }
  },

  async publish({ caption, media, tokens, options }): Promise<PublishResult> {
    const video = media.find((m) => m.type === "video");
    if (!video || media.length !== 1) {
      throw new PlatformApiError("youtube", "YouTube takes exactly one video per post");
    }

    // The description ACTUALLY being sent, which is the user's own when they
    // wrote one. Checking the caption instead meant a long caption aimed at
    // another platform aborted a YouTube upload whose description was short,
    // while a 5,000-emoji description sailed past — the composer's length check
    // counts UTF-16 units and YouTube counts bytes, so it was only refused
    // after the whole video file had been uploaded, which is the exact failure
    // this guard exists to prevent.
    const chosenDescription = optionValue("youtube", options, "description");
    const description =
      typeof chosenDescription === "string" && chosenDescription.trim()
        ? sanitize(chosenDescription)
        : sanitize(caption);
    const bytes = Buffer.byteLength(description, "utf8");
    if (bytes > 5000) {
      throw new PlatformApiError(
        "youtube",
        `description is ${bytes} bytes; YouTube allows 5000 (multi-byte characters count more than one)`,
      );
    }

    // Fetch the media stream first so its size and type can be declared in
    // the session initiation — Google requires both up front.
    //
    // The timeout here covers the HEADERS only. A fetch() signal governs the
    // whole response, body included, and this body is about to be streamed
    // into the upload PUT below — so a total-duration timer on the source
    // would abort a perfectly healthy upload at exactly 60 seconds, which a
    // 300MB video from the 1-vCPU box cannot beat. Instead: a timer that is
    // cleared the moment the headers arrive, and a stall watchdog on the
    // stream that only fires when NO bytes flow for a while.
    const sourceAbort = new AbortController();
    const headerTimer = setTimeout(() => sourceAbort.abort(), SOURCE_HEADERS_TIMEOUT_MS);
    let source: Response;
    try {
      // Guarded: this is the server fetching a tenant-chosen URL. Our own
      // storage is trusted by prefix; anything else must be a public host.
      source = await fetchMedia(
        video.url,
        { signal: sourceAbort.signal },
        { trustedPrefix: process.env.R2_PUBLIC_BASE_URL },
      );
    } catch (error) {
      if (error instanceof UnsafeMediaUrlError) {
        throw new PlatformApiError("youtube", error.message);
      }
      throw new PlatformApiError(
        "youtube",
        `could not fetch media from storage: ${error instanceof Error ? error.message : String(error)}`,
        true,
      );
    } finally {
      clearTimeout(headerTimer);
    }
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
        snippet: {
          title: youtubeTitle(caption, options),
          description,
          ...(youtubeTags(options).length > 0 ? { tags: youtubeTags(options) } : {}),
        },
        status: {
          // The user's choice; public is the default the spec declares.
          // Note that until the Phase 5 audit passes, YouTube silently forces
          // every upload from an unverified project to private regardless.
          privacyStatus: String(
            optionValue("youtube", options, "privacy_status") ?? "public",
          ),
          // COPPA. Answered by the user because the law makes it their answer,
          // not ours to assume.
          selfDeclaredMadeForKids:
            optionValue("youtube", options, "made_for_kids") === "yes",
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!session.ok) {
      sourceAbort.abort(); // release the R2 stream we will not be sending
      const body = (await session.json().catch(() => ({}))) as GoogleError;
      throw classifyUploadFailure(session.status, body);
    }
    const sessionUri = session.headers.get("location");
    if (!sessionUri) {
      sourceAbort.abort();
      throw new PlatformApiError("youtube", "upload session opened but no session URI returned");
    }

    // Step 2: stream the bytes. One PUT of the whole file; no overall timeout
    // because a large video legitimately takes minutes. The stall watchdog
    // aborts the SOURCE if nothing arrives from storage for a while, which
    // ends the PUT with a network error — classified retryable below, and
    // the retry restarts the session from scratch.
    const body = withStallWatchdog(source.body, () => sourceAbort.abort(), STREAM_STALL_MS);
    let upload: Response;
    try {
      upload = await fetch(sessionUri, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          "Content-Type": mime,
          ...(size ? { "Content-Length": size } : {}),
        },
        body,
        // Node's fetch requires half-duplex for streaming request bodies;
        // TypeScript's RequestInit does not know the field yet.
        ...({ duplex: "half" } as object),
      });
    } catch (error) {
      // A TypeError("fetch failed") here is the network — ours, R2's, or
      // Google's — not a verdict on the video. Retryable, and named, so it
      // never lands in the dead-letter pile as an opaque "fetch failed".
      throw new PlatformApiError(
        "youtube",
        `upload interrupted: ${error instanceof Error ? (error.cause instanceof Error ? error.cause.message : error.message) : String(error)}`,
        true,
      );
    }
    const result = (await upload.json().catch(() => ({}))) as {
      id?: string;
    } & GoogleError;

    if (!upload.ok) {
      throw classifyUploadFailure(upload.status, result);
    }
    if (!result.id) {
      throw new PlatformApiError(
        "youtube",
        "upload finished but YouTube returned no video id",
        true,
      );
    }

    return {
      platformPostId: result.id,
      url: `https://www.youtube.com/watch?v=${result.id}`,
    };
  },
};
