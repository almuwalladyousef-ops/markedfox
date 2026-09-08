import { requireEnv } from "@/lib/env";

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
// demonstrated in the video. If you don't need certain products or scopes,
// make sure to remove them before review." video.upload was the mismatch: it
// is Content Posting's OTHER product, the one that drops a video into the
// user's TikTok inbox as a draft, and nothing here has ever called
// /post/publish/inbox/video/init/. This adapter direct-posts, through
// /post/publish/video/init/ and /post/publish/content/init/ with
// post_mode DIRECT_POST, which is video.publish. So a reviewer was being
// asked to approve a product the demo could not show being used.
//
// Adding a scope back means adding the call that uses it AND the step in the
// demo video that shows it.
const OAUTH_SCOPES = [
  "user.info.basic",
  "user.info.profile",
  "user.info.stats",
  "video.list",
  "video.publish",
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

    // creator_info again, at publish time: the user chose a privacy level in
    // the composer against that moment's options; TikTok requires the choice
    // to still be allowed now (403 privacy_level_option_mismatch otherwise),
    // and a scheduled post may be hours or days old.
    const creator = await queryCreatorInfo(token);
    const problems = validateTikTokOptions(options, creator, { hasVideo: Boolean(video) });
    if (problems.length > 0) {
      throw new PlatformApiError("tiktok", problems.join(" "));
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
      const init = await tiktok<{ data?: { publish_id?: string } }>(
        "/post/publish/video/init/",
        {
          token,
          headers: { "Content-Type": "application/json; charset=UTF-8" },
          body: JSON.stringify({
            post_info: {
              title: caption,
              privacy_level: privacy,
              disable_comment: !options.allow_comment,
              disable_duet: !options.allow_duet,
              disable_stitch: !options.allow_stitch,
              ...commercial,
              ...(options.is_aigc ? { is_aigc: true } : {}),
            },
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
            post_info: {
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
        const username = creator.creatorUsername;
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
