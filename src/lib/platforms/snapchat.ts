import { createCipheriv, randomBytes } from "node:crypto";

import { requireEnv } from "@/lib/env";
import { fetchMedia, UnsafeMediaUrlError } from "@/lib/media/fetch-guard";

import { PlatformApiError, PlatformAuthError } from "./errors";
import type {
  ConnectedAccount,
  ConnectionTokens,
  PlatformAdapter,
  PublishResult,
} from "./types";

// Snapchat Public Profile API — Spotlight posts to a creator's Public Profile.
//
// Access is allowlist-only with no self-service path: the owner creates an
// OAuth app in Snap Business Manager (business.snapchat.com → Business
// Details), then emails dev-support@snap.com with the client_id (never the
// secret) asking for Public Profile API access. Sprout Social ships exactly
// this integration, so Snap does grant it to SaaS partners — one at a time.
//
// Until that allowlisting lands, nothing here can run against the live API,
// so the request/response shapes below follow Snap's published docs
// (developers.snap.com, Public Profile API) but are UNVERIFIED against a real
// account — the same standing TikTok and YouTube are in until their audits.
//
// Publishing target is SPOTLIGHT, Snap's short-vertical-video surface — the
// one MarkedFox creators cross-post to. API-posted Stories have no caption
// field at all, so the caption would be silently dropped there; Spotlight
// carries it as `description` (160 chars).
//
// Snap's upload is the strangest in the registry: the file must be encrypted
// client-side with AES-256-CBC, the key and IV handed over in the container
// create, and the ciphertext uploaded in ≤32MB chunks (≤1GB, ≤35 parts).
// Media containers expire 24 hours after creation, so everything happens at
// publish time.
//
// Memory: the bytes are STREAMED from storage through the cipher and out in
// parts — CBC ciphertext is a deterministic byte stream, so part boundaries
// are stable without ever holding the whole file. Resident memory is one
// part (~32MB), not 2–3x the video, which on the 2GB box is the difference
// between publishing and the kernel killing the process mid-tick.

const AUTHORIZE = "https://accounts.snapchat.com/login/oauth2/authorize";
const TOKEN = "https://accounts.snapchat.com/login/oauth2/access_token";
const ADS_API = "https://adsapi.snapchat.com/v1";
const API = "https://businessapi.snapchat.com/v1";

const OAUTH_SCOPES = ["snapchat-profile-api"];

// Part size for the chunked upload. Exported as a mutable tuning object so a
// test can drive the multi-part path with kilobytes instead of 64MB.
export const uploadTuning = { partBytes: 32 * 1024 * 1024 };
// Snap's own ceiling for Spotlight media. Checked against Content-Length up
// front and against the bytes actually read, because Content-Length can be
// absent or wrong.
const MAX_BYTES = 1024 * 1024 * 1024;
const STREAM_STALL_MS = 120_000;

type SnapError = {
  request_status?: string;
  debug_message?: string;
  display_message?: string;
  error_code?: string;
  error?: string;
  error_description?: string;
};

async function snap<T>(
  url: string,
  init?: RequestInit & { tokenEndpoint?: boolean },
): Promise<T> {
  const { tokenEndpoint, ...request } = init ?? {};
  const response = await fetch(url, {
    ...request,
    signal: AbortSignal.timeout(60_000),
  });
  const body = (await response.json().catch(() => ({}))) as T & SnapError;

  const failed =
    !response.ok ||
    (body.request_status && body.request_status.toUpperCase() === "ERROR");
  if (failed) {
    const detail =
      body.display_message ??
      body.debug_message ??
      body.error_description ??
      body.error ??
      `HTTP ${response.status}`;
    if (response.status === 401) {
      throw new PlatformAuthError("snapchat", detail);
    }
    // OAuth token endpoints report a revoked/expired refresh token as 400
    // invalid_grant, not 401 — that is a dead grant, so the connection must
    // be marked rather than retried.
    if (tokenEndpoint && response.status === 400 && body.error === "invalid_grant") {
      throw new PlatformAuthError("snapchat", detail);
    }
    throw new PlatformApiError(
      "snapchat",
      detail,
      response.status === 429 || response.status >= 500,
    );
  }
  return body;
}

async function tokenCall(params: Record<string, string>): Promise<ConnectionTokens> {
  const out = await snap<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  }>(TOKEN, {
    method: "POST",
    tokenEndpoint: true,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requireEnv("SNAPCHAT_CLIENT_ID"),
      client_secret: requireEnv("SNAPCHAT_CLIENT_SECRET"),
      ...params,
    }).toString(),
  });
  return {
    accessToken: out.access_token,
    // Returned on every refresh; whether the old one dies is undocumented,
    // so the newest is always the one persisted.
    refreshToken: out.refresh_token,
    expiresAt: out.expires_in
      ? new Date(Date.now() + out.expires_in * 1000)
      : undefined,
    scopes: out.scope ? out.scope.split(" ") : OAUTH_SCOPES,
  };
}

export const snapchat: PlatformAdapter = {
  id: "snapchat",
  displayName: "Snapchat",
  requiredEnv: ["SNAPCHAT_CLIENT_ID", "SNAPCHAT_CLIENT_SECRET"],
  refreshPolicy: "on-use",
  capabilities: {
    text: false,
    image: false, // Spotlight is video-only (6–60s vertical)
    video: true,
    carousel: false,
    schedule: true,
    analytics: false,
  },

  // 160 characters is the Spotlight description cap. Vertical MP4, minimum
  // 540x960, 6–60 seconds, ≤1GB.
  rules: {
    captionMaxChars: 160,
    mediaMax: 1,
    maxVideos: 1,
    mixedMediaAllowed: false,
    hashtagMax: null,
  },

  getAuthorizeUrl({ redirectUri, state }) {
    const url = new URL(AUTHORIZE);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", requireEnv("SNAPCHAT_CLIENT_ID"));
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", OAUTH_SCOPES.join(" "));
    url.searchParams.set("state", state);
    return url.toString();
  },

  async connect({ code, redirectUri }) {
    const tokens = await tokenCall({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });
    const auth = { Authorization: `Bearer ${tokens.accessToken}` };

    // The token belongs to a Business Manager member; walk their
    // organizations and collect every Public Profile they can manage. A
    // personal Snapchat account without a Public Profile has nothing to
    // connect — the API only posts to Public Profiles.
    const orgs = await snap<{
      organizations?: { organization?: { id?: string; name?: string } }[];
    }>(`${ADS_API}/me/organizations`, { headers: auth });

    const accounts: ConnectedAccount[] = [];
    for (const wrapper of orgs.organizations ?? []) {
      const org = wrapper.organization;
      if (!org?.id) continue;
      const profiles = await snap<{
        public_profiles?: {
          public_profile?: { id?: string; display_name?: string; name?: string };
        }[];
      }>(`${API}/organizations/${org.id}/public_profiles`, { headers: auth });

      for (const p of profiles.public_profiles ?? []) {
        const profile = p.public_profile;
        if (!profile?.id) continue;
        accounts.push({
          platformAccountId: profile.id,
          platformAccountName: profile.display_name ?? profile.name,
          metadata: { organizationId: org.id },
        });
      }
    }

    if (accounts.length === 0) {
      throw new PlatformApiError(
        "snapchat",
        "No Snapchat Public Profile found. The API posts to Public Profiles " +
          "inside a Snap Business Manager organization your login belongs to — " +
          "set that up at business.snapchat.com, then connect again.",
      );
    }

    return { tokens, accounts };
  },

  // Access tokens live an hour; refresh happens at publish time.
  async refresh(tokens) {
    if (!tokens.refreshToken) {
      throw new PlatformAuthError("snapchat", "no refresh token stored — reconnect this account");
    }
    return tokenCall({
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
    });
  },

  async publish({ caption, media, tokens, platformAccountId }): Promise<PublishResult> {
    const video = media.find((m) => m.type === "video");
    if (!video || media.length !== 1) {
      throw new PlatformApiError(
        "snapchat",
        "Snapchat Spotlight takes exactly one vertical video",
      );
    }
    const auth = { Authorization: `Bearer ${tokens.accessToken}` };

    // 1. Open the stream from storage. Guarded: this is the server fetching a
    //    tenant-chosen URL — our own storage by prefix, or a public host.
    //    The timeout covers the HEADERS only — a fetch signal also governs the
    //    body, and this body is streamed out over minutes. Stalls on the
    //    stream itself are caught per read below.
    const sourceAbort = new AbortController();
    const headerTimer = setTimeout(() => sourceAbort.abort(), 60_000);
    let source: Response;
    try {
      source = await fetchMedia(
        video.url,
        { signal: sourceAbort.signal },
        { trustedPrefix: process.env.R2_PUBLIC_BASE_URL },
      );
    } catch (error) {
      if (error instanceof UnsafeMediaUrlError) {
        throw new PlatformApiError("snapchat", error.message);
      }
      throw new PlatformApiError(
        "snapchat",
        `could not fetch media from storage: ${error instanceof Error ? error.message : String(error)}`,
        true,
      );
    } finally {
      clearTimeout(headerTimer);
    }
    if (!source.ok || !source.body) {
      throw new PlatformApiError(
        "snapchat",
        `could not fetch media from storage: HTTP ${source.status}`,
        true,
      );
    }
    const declared = Number(source.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES) {
      await source.body.cancel().catch(() => undefined);
      throw new PlatformApiError(
        "snapchat",
        `video is ${Math.round(declared / 1024 / 1024)}MB; Snapchat allows 1GB`,
      );
    }

    // 2. Create the media container, handing over key + IV.
    const key = randomBytes(32);
    const iv = randomBytes(16);
    const container = await snap<{
      media?: { id?: string; add_path?: string; finalize_path?: string };
      media_id?: string;
      add_path?: string;
      finalize_path?: string;
    }>(`${API}/public_profiles/${platformAccountId}/media`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "VIDEO",
        name: `markedfox-${Date.now()}.mp4`,
        key: key.toString("base64"),
        iv: iv.toString("base64"),
      }),
    });
    const mediaId = container.media?.id ?? container.media_id;
    const addPath = container.media?.add_path ?? container.add_path;
    const finalizePath = container.media?.finalize_path ?? container.finalize_path;
    if (!mediaId || !addPath || !finalizePath) {
      await source.body.cancel().catch(() => undefined);
      throw new PlatformApiError(
        "snapchat",
        "media container created but no upload paths returned",
      );
    }
    const absolute = (path: string) =>
      path.startsWith("http") ? path : `https://businessapi.snapchat.com${path}`;

    // 3. Stream: storage → AES-256-CBC → ≤32MB parts → Snap, then finalize.
    const cipher = createCipheriv("aes-256-cbc", key, iv);
    let partNumber = 0;
    const sendPart = async (bytes: Buffer) => {
      partNumber += 1;
      const form = new FormData();
      form.set("action", "ADD");
      form.set("part_number", String(partNumber));
      form.set("file", new Blob([new Uint8Array(bytes)]), "chunk");
      await snap(absolute(addPath), { method: "POST", headers: auth, body: form });
    };

    const pending: Buffer[] = [];
    let pendingBytes = 0;
    let plainBytes = 0;
    const reader = source.body.getReader();
    // No bytes for this long means the storage stream is dead, not slow.
    const readWithStallGuard = async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new PlatformApiError("snapchat", "storage stream stalled", true)),
              STREAM_STALL_MS,
            );
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    };
    try {
      for (;;) {
        const { value, done } = await readWithStallGuard();
        if (done) break;
        plainBytes += value.byteLength;
        if (plainBytes > MAX_BYTES) {
          throw new PlatformApiError("snapchat", "video exceeds Snapchat's 1GB limit");
        }
        const encrypted = cipher.update(value);
        if (encrypted.length === 0) continue;
        pending.push(encrypted);
        pendingBytes += encrypted.length;
        while (pendingBytes >= uploadTuning.partBytes) {
          const whole = Buffer.concat(pending);
          await sendPart(whole.subarray(0, uploadTuning.partBytes));
          pending.length = 0;
          const rest = whole.subarray(uploadTuning.partBytes);
          if (rest.length > 0) pending.push(Buffer.from(rest));
          pendingBytes = rest.length;
        }
      }
    } catch (error) {
      await reader.cancel().catch(() => undefined);
      throw error;
    }
    pending.push(cipher.final());
    const tail = Buffer.concat(pending);
    if (tail.length > 0 || partNumber === 0) await sendPart(tail);

    const finalizeForm = new FormData();
    finalizeForm.set("action", "FINALIZE");
    await snap(absolute(finalizePath), {
      method: "POST",
      headers: auth,
      body: finalizeForm,
    });

    // 4. Post it to Spotlight. skip_save_to_profile stays false so the post
    //    also lands on the profile rather than existing only in the feed.
    const spotlight = await snap<{
      spotlight_id?: string;
      spotlight?: { id?: string };
    }>(`${API}/public_profiles/${platformAccountId}/spotlights`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        media_id: mediaId,
        ...(caption ? { description: caption } : {}),
        locale: "en_US",
        skip_save_to_profile: false,
      }),
    });

    const id = spotlight.spotlight_id ?? spotlight.spotlight?.id ?? mediaId;
    return { platformPostId: id };
  },
};
