import { requireEnv } from "@/lib/env";

import { PlatformApiError, PlatformAuthError } from "./errors";
import { pollDelays, VIDEO_POLL_TOTAL_MS } from "./polling";
import type { ConnectionTokens, PlatformAdapter, PublishResult } from "./types";

// TikTok Content Posting API (Direct Post).
//
// Until TikTok's audit passes, this adapter works but the results are
// deliberately crippled by TikTok (CLAUDE.md platform table): every post is
// forced to SELF_ONLY, the posting account must be private, and only 5 users
// may post per 24h. Build now, audit in Phase 5, useful after.
//
// Media reaches TikTok by PULL_FROM_URL: TikTok downloads from our public R2
// URL. Two consequences, both load-bearing:
//
//   1. The media URL's domain must be VERIFIED as ours in the TikTok
//      developer portal (URL properties). A raw pub-*.r2.dev subdomain can
//      never be verified — the R2 bucket needs a custom domain on
//      markedfox.com before TikTok publishing works. 403
//      url_ownership_unverified is the symptom.
//   2. TikTok downloads asynchronously (up to an hour), so publish() polls
//      status/fetch and only returns once the download+post settled — which
//      also keeps the media-purge sweep from deleting a file TikTok has not
//      fetched yet, since the post row stays unsettled until then.
//
// Audit-visible UX duties (privacy dropdown with no default, creator
// nickname shown, toggles off by default) belong to the composer and are a
// Phase 5 filing task — tracked in the session log, not silently skipped.

const AUTHORIZE = "https://www.tiktok.com/v2/auth/authorize/";
const API = "https://open.tiktokapis.com/v2";

const OAUTH_SCOPES = ["user.info.basic", "video.publish", "video.upload"];

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

type CreatorInfo = {
  data?: {
    creator_username?: string;
    creator_nickname?: string;
    privacy_level_options?: string[];
    max_video_post_duration_sec?: number;
  };
};

// Most-public first. privacy_level MUST be one of the options creator_info
// returned for this user (403 privacy_level_option_mismatch otherwise), and
// which ones appear depends on whether the account is public or private —
// hardcoding PUBLIC_TO_EVERYONE breaks private accounts, including every
// account during the pre-audit phase.
const PRIVACY_PREFERENCE = [
  "PUBLIC_TO_EVERYONE",
  "FOLLOWER_OF_CREATOR",
  "MUTUAL_FOLLOW_FRIENDS",
  "SELF_ONLY",
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const tiktokAdapter: PlatformAdapter = {
  id: "tiktok",
  displayName: "TikTok",
  requiredEnv: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
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

  async publish({ caption, media, tokens }): Promise<PublishResult> {
    if (media.length === 0) {
      throw new PlatformApiError("tiktok", "TikTok needs a video or photos");
    }
    const token = tokens.accessToken;

    // Mandatory first call per TikTok's integration rules — and genuinely
    // needed: it is the only source of the privacy levels this user may post
    // with, and of their username for the post URL.
    const creator = await tiktok<CreatorInfo>("/post/publish/creator_info/query/", {
      token,
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: "{}",
    });
    const options = creator.data?.privacy_level_options ?? [];
    const privacy = PRIVACY_PREFERENCE.find((p) => options.includes(p));
    if (!privacy) {
      throw new PlatformApiError(
        "tiktok",
        "TikTok reported no allowed privacy level for this account",
      );
    }

    const video = media.find((m) => m.type === "video");
    let publishId: string;

    if (video) {
      const init = await tiktok<{ data?: { publish_id?: string } }>(
        "/post/publish/video/init/",
        {
          token,
          headers: { "Content-Type": "application/json; charset=UTF-8" },
          body: JSON.stringify({
            post_info: { title: caption, privacy_level: privacy },
            source_info: { source: "PULL_FROM_URL", video_url: video.url },
          }),
        },
      );
      publishId = init.data?.publish_id ?? "";
    } else {
      const init = await tiktok<{ data?: { publish_id?: string } }>(
        "/post/publish/content/init/",
        {
          token,
          headers: { "Content-Type": "application/json; charset=UTF-8" },
          body: JSON.stringify({
            media_type: "PHOTO",
            post_mode: "DIRECT_POST",
            post_info: { description: caption, privacy_level: privacy },
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

    // TikTok downloads the media itself, then posts — poll until it settles.
    // The video budget applies to photos too; downloads are the slow part.
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
      if (status === "PUBLISH_COMPLETE") {
        const postId = check.data?.publicaly_available_post_id?.[0];
        const username = creator.data?.creator_username;
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
