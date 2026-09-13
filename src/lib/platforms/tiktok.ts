import { requireEnv } from "@/lib/env";
import { fetchMedia, UnsafeMediaUrlError } from "@/lib/media/fetch-guard";

import { PlatformApiError, PlatformAuthError } from "./errors";
import { pollDelays, VIDEO_POLL_TOTAL_MS } from "./polling";
import {
  parseCreatorContext,
  parseTikTokOptions,
  validateTikTokOptions,
  type TikTokCreatorContext,
} from "./tiktok-options";
import type {
  AccountInsights,
  AccountMediaItem,
  AccountProfile,
  ConnectionTokens,
  PlatformAdapter,
  PublishResult,
} from "./types";
import { withStallWatchdog } from "./youtube";

// TikTok Content Posting API — both of its products.
//
//   - Direct Post (video.publish): the video goes straight to the profile.
//   - Upload (video.upload): the video lands in the creator's TikTok inbox as
//     a draft, and they finish and post it inside the TikTok app.
//
// The creator picks one per post in the composer (options.post_mode).
//
// Until TikTok's audit passes, this adapter works but the results are
// deliberately crippled by TikTok (CLAUDE.md platform table): every post is
// forced to SELF_ONLY, the posting account must be private, and only 5 users
// may post per 24h. Build now, audit in Phase 5, useful after.
//
// Videos reach TikTok by FILE_UPLOAD: our server reads the file from R2 and
// PUTs it to TikTok in chunks. The alternative, PULL_FROM_URL, has TikTok
// download from our media URL, and TikTok only does that from a domain
// verified as ours in the portal. Our media lives on a pub-*.r2.dev
// subdomain, which can never be verified, so every pulled video failed with
// url_ownership_unverified. Only one chunk (10MB, the last up to 20MB) is in
// memory at a time.
//
// Photo posts have no FILE_UPLOAD source at all, so they still pull by URL
// and still need the R2 bucket on a verified custom domain before they work.
//
// TikTok processes asynchronously, so publish() polls status/fetch and only
// returns once the post settled — which also keeps the media-purge sweep from
// deleting a file TikTok has not finished with, since the post row stays
// unsettled until then.
//
// The audit-visible UX duties (privacy dropdown with no default, creator
// nickname shown, interaction toggles off by default, commercial-content
// disclosure, consent line) are implemented: getPublishContext() serves
// creator_info to the composer, validateOptions() judges the user's choices
// with the same pure function the composer runs (./tiktok-options.ts), and
// publish() applies them. Nothing here picks a privacy level for the user.

const AUTHORIZE = "https://www.tiktok.com/v2/auth/authorize/";
const API = "https://open.tiktokapis.com/v2";

// user.info.profile and user.info.stats carry the avatar, bio, follower and
// video counts the home screen shows; video.list is the connected account's
// own videos with view counts.
//
// Every scope here is one this adapter actually calls, and that is a review
// requirement rather than tidiness. TikTok refused the 2026-09-08 submission
// with "Scopes mismatch — all selected products and scopes must be clearly
// demonstrated in the video." video.upload was the mismatch: nothing called
// the inbox endpoint. The portal offers no way to remove video.upload — it is
// bundled into Content Posting API — so it came back WITH the call that uses
// it: "Send to TikTok drafts" in the composer, through
// /post/publish/inbox/video/init/ and post_mode MEDIA_UPLOAD.
//
// Adding a scope means adding the call that uses it AND the step in the demo
// video that shows it.
const OAUTH_SCOPES = [
  "user.info.basic",
  "user.info.profile",
  "user.info.stats",
  "video.list",
  "video.publish",
  "video.upload",
];

type TikTokError = {
  error?: { code?: string; message?: string; log_id?: string };
};

// Token-endpoint failures use OAuth-style fields instead.
type TokenError = { error?: string; error_description?: string };

async function tiktok<T>(
  path: string,
  init: RequestInit & { token?: string },
): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method: init.method ?? "POST",
    headers: {
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      ...init.headers,
    },
    body: init.body,
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await response.json().catch(() => ({}))) as T & TikTokError;

  const code = body.error?.code;
  if (!response.ok || (code && code !== "ok")) {
    const detail = body.error?.message ?? code ?? `HTTP ${response.status}`;
    if (
      response.status === 401 ||
      code === "access_token_invalid" ||
      code === "token_expired"
    ) {
      throw new PlatformAuthError("tiktok", detail);
    }
    const retryable =
      response.status === 429 ||
      response.status >= 500 ||
      code === "rate_limit_exceeded";
    throw new PlatformApiError("tiktok", detail, retryable);
  }
  return body;
}

function toTokens(out: {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}): ConnectionTokens {
  return {
    accessToken: out.access_token,
    // May differ from the one sent — TikTok's docs say to always keep the
    // returned value. The store persists whatever comes back here.
    refreshToken: out.refresh_token,
    expiresAt: out.expires_in
      ? new Date(Date.now() + out.expires_in * 1000)
      : undefined,
    scopes: out.scope ? out.scope.split(",") : OAUTH_SCOPES,
  };
}

// The token endpoint takes x-www-form-urlencoded and reports errors in OAuth
// shape, so it does not go through tiktok().
async function tokenCall(params: Record<string, string>): Promise<ConnectionTokens> {
  const form = new URLSearchParams({
    client_key: requireEnv("TIKTOK_CLIENT_KEY"),
    client_secret: requireEnv("TIKTOK_CLIENT_SECRET"),
    ...params,
  });
  const response = await fetch(`${API}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  } & TokenError;

  if (!response.ok || !body.access_token) {
    const detail = body.error_description ?? body.error ?? `HTTP ${response.status}`;
    if (body.error === "invalid_grant") {
      throw new PlatformAuthError("tiktok", detail);
    }
    throw new PlatformApiError("tiktok", detail, response.status >= 500);
  }
  return toTokens(body as { access_token: string });
}

type CreatorInfo = { data?: Record<string, unknown> };

// Mandatory first call per TikTok's integration rules — and genuinely
// needed: it is the only source of the privacy levels this user may post
// with, of which interactions they have disabled, and of their nickname.
async function queryCreatorInfo(token: string): Promise<TikTokCreatorContext> {
  const creator = await tiktok<CreatorInfo>("/post/publish/creator_info/query/", {
    token,
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: "{}",
  });
  return parseCreatorContext(creator.data);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// TikTok's chunk rules (Media Transfer Guide): chunks are 5–64MB; a file of
// one chunk or less goes up whole; every chunk is chunk_size except the last,
// which takes the remainder (so total_chunk_count rounds DOWN); at most 1000
// chunks. 10MB keeps one chunk in memory on a 2GB box.
export const TIKTOK_CHUNK_BYTES = 10 * 1024 * 1024;
const TIKTOK_MAX_CHUNKS = 1000;

export type TikTokChunkPlan = {
  videoSize: number;
  chunkSize: number;
  totalChunkCount: number;
  /** Inclusive byte ranges, one per chunk, exactly as Content-Range names them. */
  ranges: [number, number][];
};

export function planTikTokChunks(videoSize: number): TikTokChunkPlan {
  if (!Number.isSafeInteger(videoSize) || videoSize <= 0) {
    throw new PlatformApiError("tiktok", "storage did not report the video's size");
  }
  if (videoSize <= TIKTOK_CHUNK_BYTES) {
    return {
      videoSize,
      chunkSize: videoSize,
      totalChunkCount: 1,
      ranges: [[0, videoSize - 1]],
    };
  }
  const totalChunkCount = Math.floor(videoSize / TIKTOK_CHUNK_BYTES);
  if (totalChunkCount > TIKTOK_MAX_CHUNKS) {
    throw new PlatformApiError(
      "tiktok",
      `video is ${Math.round(videoSize / 1024 / 1024)}MB, too large for TikTok`,
    );
  }
  const ranges: [number, number][] = [];
  for (let i = 0; i < totalChunkCount; i++) {
    const start = i * TIKTOK_CHUNK_BYTES;
    const last = i === totalChunkCount - 1;
    ranges.push([start, last ? videoSize - 1 : start + TIKTOK_CHUNK_BYTES - 1]);
  }
  return { videoSize, chunkSize: TIKTOK_CHUNK_BYTES, totalChunkCount, ranges };
}

// TikTok accepts these three container types for an uploaded video.
export function tiktokVideoContentType(video: { url: string; mime?: string }): string {
  const mime = video.mime?.toLowerCase();
  if (mime === "video/quicktime" || mime === "video/webm" || mime === "video/mp4") {
    return mime;
  }
  const path = video.url.split("?")[0].toLowerCase();
  if (path.endsWith(".mov")) return "video/quicktime";
  if (path.endsWith(".webm")) return "video/webm";
  return "video/mp4";
}

// The R2 fetch must answer with headers inside this window; the body is then
// governed by the stall watchdog, not by a clock.
const SOURCE_HEADERS_TIMEOUT_MS = 60_000;
const STREAM_STALL_MS = 120_000;
const CHUNK_PUT_TIMEOUT_MS = 180_000;

// Opens the video from storage and reports its size, which TikTok needs
// before it hands out an upload URL. Guarded: this is the server fetching a
// tenant-chosen URL — our own storage by prefix, or a public host.
async function openVideoSource(
  url: string,
): Promise<{ body: ReadableStream<Uint8Array>; size: number; abort: () => void }> {
  const controller = new AbortController();
  const headerTimer = setTimeout(() => controller.abort(), SOURCE_HEADERS_TIMEOUT_MS);
  let source: Response;
  try {
    source = await fetchMedia(
      url,
      { signal: controller.signal },
      { trustedPrefix: process.env.R2_PUBLIC_BASE_URL },
    );
  } catch (error) {
    if (error instanceof UnsafeMediaUrlError) {
      throw new PlatformApiError("tiktok", error.message);
    }
    throw new PlatformApiError(
      "tiktok",
      `could not fetch media from storage: ${error instanceof Error ? error.message : String(error)}`,
      true,
    );
  } finally {
    clearTimeout(headerTimer);
  }
  if (!source.ok || !source.body) {
    throw new PlatformApiError(
      "tiktok",
      `could not fetch media from storage: HTTP ${source.status}`,
      true,
    );
  }
  const size = Number(source.headers.get("content-length"));
  if (!Number.isSafeInteger(size) || size <= 0) {
    controller.abort();
    throw new PlatformApiError("tiktok", "storage did not report the video's size", true);
  }
  return {
    body: withStallWatchdog(source.body, () => controller.abort(), STREAM_STALL_MS),
    size,
    abort: () => controller.abort(),
  };
}

// Reads the stream and PUTs it to TikTok one planned chunk at a time.
export async function pushTikTokChunks(
  body: ReadableStream<Uint8Array>,
  plan: TikTokChunkPlan,
  uploadUrl: string,
  contentType: string,
  put: typeof fetch = fetch,
): Promise<void> {
  const reader = body.getReader();
  let pending: Buffer[] = [];
  let pendingBytes = 0;
  let sent = 0;

  const send = async (chunk: Buffer, [start, end]: [number, number]) => {
    const response = await put(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(chunk.byteLength),
        "Content-Range": `bytes ${start}-${end}/${plan.videoSize}`,
      },
      body: new Uint8Array(chunk),
      signal: AbortSignal.timeout(CHUNK_PUT_TIMEOUT_MS),
    });
    // 206 while chunks remain, 201 once the file is whole.
    if (response.status !== 206 && response.status !== 201 && !response.ok) {
      throw new PlatformApiError(
        "tiktok",
        `video upload failed at bytes ${start}-${end}: HTTP ${response.status}`,
        response.status === 429 || response.status >= 500,
      );
    }
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (value && value.byteLength > 0) {
        pending.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
        pendingBytes += value.byteLength;
      }
      while (sent < plan.ranges.length) {
        const range = plan.ranges[sent];
        const need = range[1] - range[0] + 1;
        if (pendingBytes < need) break;
        const joined = Buffer.concat(pending, pendingBytes);
        await send(joined.subarray(0, need), range);
        const rest = joined.subarray(need);
        pending = rest.byteLength > 0 ? [Buffer.from(rest)] : [];
        pendingBytes = rest.byteLength;
        sent += 1;
      }
      if (done) break;
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }

  if (sent !== plan.ranges.length || pendingBytes !== 0) {
    throw new PlatformApiError(
      "tiktok",
      `storage sent a different number of bytes than the ${plan.videoSize} it declared`,
      true,
    );
  }
}

// TikTok is the one platform that hands over real view counts for the
// connected account: video.list returns the user's own videos with views,
// likes, comments and shares. It cannot see anyone else's — the Research API
// is academic-only — which is exactly why this reads "your account", not
// "your competitors".
const tiktokInsights: AccountInsights = {
  primaryMetric: "views",
  metered: false,
  requiredScopes: ["video.list"],

  async readProfile({ tokens }) {
    const out = await tiktok<{
      data?: {
        user?: {
          open_id?: string;
          display_name?: string;
          avatar_url?: string;
          profile_deep_link?: string;
          bio_description?: string;
          follower_count?: number;
          following_count?: number;
          video_count?: number;
        };
      };
    }>(
      "/user/info/?fields=open_id,display_name,avatar_url,profile_deep_link," +
        "bio_description,follower_count,following_count,video_count",
      { method: "GET", token: tokens.accessToken },
    );

    const user = out.data?.user ?? {};
    const profile: AccountProfile = {
      handle: undefined, // TikTok returns a display name, not a @handle
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      bio: user.bio_description,
      profileUrl: user.profile_deep_link,
      followers: user.follower_count ?? null,
      following: user.following_count ?? null,
      postCount: user.video_count ?? null,
    };
    return profile;
  },

  async listMedia({ tokens, limit = 20 }) {
    const out = await tiktok<{
      data?: {
        videos?: {
          id: string;
          title?: string;
          video_description?: string;
          cover_image_url?: string;
          share_url?: string;
          create_time?: number;
          view_count?: number;
          like_count?: number;
          comment_count?: number;
          share_count?: number;
          /** Seconds. TikTok's own field, already whole. */
          duration?: number;
        }[];
      };
    }>(
      "/video/list/?fields=id,title,video_description,cover_image_url," +
        "share_url,create_time,duration,view_count,like_count,comment_count," +
        "share_count",
      {
        method: "POST",
        token: tokens.accessToken,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ max_count: Math.min(Math.max(limit, 1), 20) }),
      },
    );

    return (out.data?.videos ?? []).map((video): AccountMediaItem => ({
      externalId: video.id,
      kind: "video",
      caption: video.title || video.video_description,
      permalink: video.share_url,
      thumbnailUrl: video.cover_image_url,
      durationSeconds:
        typeof video.duration === "number" && video.duration > 0
          ? Math.round(video.duration)
          : null,
      // create_time is unix seconds.
      postedAt: video.create_time
        ? new Date(video.create_time * 1000).toISOString()
        : undefined,
      views: video.view_count ?? null,
      likes: video.like_count ?? null,
      comments: video.comment_count ?? null,
      shares: video.share_count ?? null,
    }));
  },
};

export const tiktokAdapter: PlatformAdapter = {
  id: "tiktok",
  displayName: "TikTok",
  requiredEnv: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
  insights: tiktokInsights,
  refreshPolicy: "on-use",
  capabilities: {
    text: false, // no text-only posts
    image: true, // photo posts, up to 35 images
    video: true, // single video per post
    carousel: true,
    schedule: true,
    analytics: false,
  },

  // Video captions (post_info.title) allow 2200 UTF-16 code units, hashtags
  // and mentions included, no separate hashtag cap. Photo posts actually
  // allow 4000 in their description field — the tighter video number is
  // enforced for both so one caption can target either media shape.
  rules: {
    captionMaxChars: 2200,
    mediaMax: 35,
    maxVideos: 1,
    mixedMediaAllowed: false,
    hashtagMax: null,
  },

  getAuthorizeUrl({ redirectUri, state }) {
    const url = new URL(AUTHORIZE);
    url.searchParams.set("client_key", requireEnv("TIKTOK_CLIENT_KEY")); // not client_id
    url.searchParams.set("scope", OAUTH_SCOPES.join(",")); // comma-separated here
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    return url.toString();
  },

  async connect({ code, redirectUri }) {
    const tokens = await tokenCall({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });

    const me = await tiktok<{
      data?: { user?: { open_id?: string; display_name?: string } };
    }>("/user/info/?fields=open_id,display_name", {
      method: "GET",
      token: tokens.accessToken,
    });

    const user = me.data?.user;
    if (!user?.open_id) {
      throw new PlatformApiError("tiktok", "could not read the connected account's identity");
    }

    return {
      tokens,
      accounts: [
        {
          platformAccountId: user.open_id,
          platformAccountName: user.display_name,
          metadata: {},
        },
      ],
    };
  },

  // Access tokens live 24h, refresh tokens 365 days from INITIAL issuance —
  // refreshing does not extend that year, so a connection ultimately needs
  // reauthorizing annually no matter what. Refresh happens at publish time
  // (refreshPolicy "on-use").
  async refresh(tokens) {
    if (!tokens.refreshToken) {
      throw new PlatformAuthError("tiktok", "no refresh token stored — reconnect this account");
    }
    return tokenCall({
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
    });
  },

  // POST /v2/oauth/revoke/ invalidates the access token and its refresh
  // token together; the user's TikTok app-permissions page forgets MarkedFox.
  async revoke(tokens) {
    const form = new URLSearchParams({
      client_key: requireEnv("TIKTOK_CLIENT_KEY"),
      client_secret: requireEnv("TIKTOK_CLIENT_SECRET"),
      token: tokens.accessToken,
    });
    const response = await fetch(`${API}/oauth/revoke/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new PlatformApiError("tiktok", `revoke failed: HTTP ${response.status}`, true);
    }
  },

  // Served to the composer so it can show who the post goes to and offer
  // only the privacy levels and interactions TikTok allows this creator.
  async getPublishContext(tokens) {
    return queryCreatorInfo(tokens.accessToken) as Promise<Record<string, unknown>>;
  },

  validateOptions(options, context, input) {
    return validateTikTokOptions(
      parseTikTokOptions(options),
      context ? (context as unknown as TikTokCreatorContext) : null,
      input,
    );
  },

  async publish({ caption, media, tokens, options: rawOptions }): Promise<PublishResult> {
    if (media.length === 0) {
      throw new PlatformApiError("tiktok", "TikTok needs a video or photos");
    }
    const token = tokens.accessToken;
    const video = media.find((m) => m.type === "video");
    const options = parseTikTokOptions(rawOptions);
    const inbox = options.post_mode === "inbox";

    // A connection authorized between 2026-09-08 and the day video.upload
    // came back holds a token without it. Say so plainly rather than pass on
    // TikTok's scope_not_authorized.
    if (inbox && tokens.scopes && tokens.scopes.length > 0 && !tokens.scopes.includes("video.upload")) {
      throw new PlatformApiError(
        "tiktok",
        "This TikTok connection cannot save drafts yet. Reconnect TikTok, then try again.",
      );
    }

    // creator_info again, at publish time: the user chose a privacy level in
    // the composer against that moment's options; TikTok requires the choice
    // to still be allowed now (403 privacy_level_option_mismatch otherwise),
    // and a scheduled post may be hours or days old. A draft sent to the
    // inbox carries no privacy level, so it has nothing to re-check.
    const creator = inbox ? null : await queryCreatorInfo(token);
    if (creator) {
      const problems = validateTikTokOptions(options, creator, { hasVideo: Boolean(video) });
      if (problems.length > 0) {
        throw new PlatformApiError("tiktok", problems.join(" "));
      }
    }
    const privacy = options.privacy_level as string;

    // Interactions are opt-in (off unless the user allowed them), per
    // TikTok's rules; disclosure toggles map straight onto the API's names.
    const commercial = options.disclose_commercial
      ? {
          brand_content_toggle: Boolean(options.brand_content),
          brand_organic_toggle: Boolean(options.brand_organic),
        }
      : {};

    let publishId: string;

    if (video) {
      const source = await openVideoSource(video.url);
      try {
        const plan = planTikTokChunks(source.size);
        const sourceInfo = {
          source: "FILE_UPLOAD",
          video_size: plan.videoSize,
          chunk_size: plan.chunkSize,
          total_chunk_count: plan.totalChunkCount,
        };
        const init = await tiktok<{ data?: { publish_id?: string; upload_url?: string } }>(
          inbox ? "/post/publish/inbox/video/init/" : "/post/publish/video/init/",
          {
            token,
            headers: { "Content-Type": "application/json; charset=UTF-8" },
            body: JSON.stringify(
              inbox
                ? { source_info: sourceInfo }
                : {
                    post_info: {
                      title: caption,
                      privacy_level: privacy,
                      disable_comment: !options.allow_comment,
                      disable_duet: !options.allow_duet,
                      disable_stitch: !options.allow_stitch,
                      ...commercial,
                      ...(options.is_aigc ? { is_aigc: true } : {}),
                    },
                    source_info: sourceInfo,
                  },
            ),
          },
        );
        publishId = init.data?.publish_id ?? "";
        const uploadUrl = init.data?.upload_url;
        if (!publishId || !uploadUrl) {
          throw new PlatformApiError("tiktok", "TikTok returned no upload URL for the video");
        }
        await pushTikTokChunks(source.body, plan, uploadUrl, tiktokVideoContentType(video));
      } catch (error) {
        source.abort();
        throw error;
      }
    } else {
      const init = await tiktok<{ data?: { publish_id?: string } }>(
        "/post/publish/content/init/",
        {
          token,
          headers: { "Content-Type": "application/json; charset=UTF-8" },
          body: JSON.stringify({
            media_type: "PHOTO",
            post_mode: inbox ? "MEDIA_UPLOAD" : "DIRECT_POST",
            post_info: inbox
              ? { description: caption }
              : {
                  description: caption,
                  privacy_level: privacy,
                  disable_comment: !options.allow_comment,
                  ...commercial,
                },
            source_info: {
              source: "PULL_FROM_URL", // the only source photos support
              photo_images: media.slice(0, 35).map((m) => m.url),
              photo_cover_index: 0,
            },
          }),
        },
      );
      publishId = init.data?.publish_id ?? "";
    }

    if (!publishId) {
      throw new PlatformApiError("tiktok", "TikTok accepted the post but returned no publish id");
    }

    // TikTok processes the media, then posts or delivers the draft — poll
    // until it settles. The video budget applies to photos too.
    for (const delay of pollDelays(VIDEO_POLL_TOTAL_MS)) {
      const check = await tiktok<{
        data?: {
          status?: string;
          fail_reason?: string;
          publicaly_available_post_id?: number[]; // TikTok's own spelling
        };
      }>("/post/publish/status/fetch/", {
        token,
        headers: { "Content-Type": "application/json; charset=UTF-8" },
        body: JSON.stringify({ publish_id: publishId }),
      });

      const status = check.data?.status;
      // The draft is in the creator's inbox. That is the end of our part:
      // they post it from the TikTok app, and there is no post id until then.
      if (inbox && status === "SEND_TO_USER_INBOX") {
        return { platformPostId: publishId };
      }
      if (status === "PUBLISH_COMPLETE") {
        const postId = check.data?.publicaly_available_post_id?.[0];
        const username = creator?.creatorUsername;
        return {
          // Public posts carry TikTok's own id; SELF_ONLY ones (pre-audit)
          // do not, so the publish_id is the trace we keep instead.
          platformPostId: postId ? String(postId) : publishId,
          url:
            postId && username
              ? `https://www.tiktok.com/@${username}/video/${postId}`
              : undefined,
        };
      }
      if (status === "FAILED") {
        throw new PlatformApiError(
          "tiktok",
          `publish failed: ${check.data?.fail_reason ?? "no reason given"}`,
        );
      }
      await sleep(delay);
    }

    // TikTok's download window is up to an hour; our poll budget is not. The
    // post may still complete on TikTok's side after this error — the message
    // says so rather than pretending the outcome is known.
    throw new PlatformApiError(
      "tiktok",
      `still processing after ${Math.round(VIDEO_POLL_TOTAL_MS / 1000)}s ` +
        `(publish_id ${publishId}) — check TikTok before retrying, it may still go out`,
      true,
    );
  },
};
