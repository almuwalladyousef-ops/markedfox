import { requireEnv } from "@/lib/env";

import { PlatformApiError, PlatformAuthError } from "./errors";
import { pollDelays, pollTotalMs } from "./polling";
import { optionValue } from "./publish-options";
import type {
  AccountInsights,
  AccountMediaItem,
  AccountProfile,
  ConnectedAccount,
  ConnectionTokens,
  PlatformAdapter,
  PublishResult,
} from "./types";

// Instagram via the Meta Business app ("Instagram API with Facebook Login").
// The user signs in with Facebook; we list the Pages they manage and store one
// connection per linked Instagram Business account. This is the flavor whose
// permission names (instagram_basic, instagram_content_publish,
// instagram_manage_messages) match the App Review plan in CLAUDE.md, and it
// works in Development mode for accounts holding an app role before review.
//
// Requires (owner setup, Phase 0/1): a Facebook Page linked to the Instagram
// Business account, and the callback URL registered as a Valid OAuth Redirect
// URI on the Meta app once the domain is live.

// Matches the version Meta's own tooling currently issues OAuth against
// (observed in the Developer Tools MCP sign-in URL, 2026-08).
const GRAPH_VERSION = "v26.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

// Publishing scopes — what every Instagram connect asks for.
const OAUTH_SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
  "pages_show_list",
  "pages_read_engagement",
  "business_management",
];

// The DM/comment automation scopes, requested only when the user turns
// automation on for an account ("messaging" feature). Kept apart so the
// publishing connect keeps working on an app where these permissions have
// not been added in the dashboard yet, and so the consent screen asks for
// the hardest permission Meta grants only when there is a reason to.
const MESSAGING_SCOPES = [
  "instagram_manage_comments",
  "instagram_manage_messages",
  "pages_messaging",
  // Required by POST /{page-id}/subscribed_apps — without it the connect
  // succeeds but the Page never subscribes to webhook events, so comments
  // and DMs simply never arrive. Found live 2026-08-30: Meta answered the
  // subscribe with "(#200) Requires pages_manage_metadata permission".
  "pages_manage_metadata",
];

// Container polling lives in ./polling — the schedule and its reasoning are
// shared with Threads, which publishes the same way.

type GraphError = {
  error?: { message?: string; type?: string; code?: number };
};

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
    // Graph code 190 = invalid/expired token; type OAuthException covers
    // revoked grants and bad secrets. Those are reconnect-not-retry failures.
    if (err?.code === 190 || err?.type === "OAuthException") {
      throw new PlatformAuthError("instagram", detail);
    }
    // Rate limits (4, 17, 32, 613) and 5xx are worth retrying with backoff.
    const retryable =
      response.status >= 500 || [4, 17, 32, 613].includes(err?.code ?? -1);
    throw new PlatformApiError("instagram", detail, retryable);
  }

  return body;
}

function expiryFrom(expiresInSeconds: number | undefined): Date | undefined {
  if (!expiresInSeconds) return undefined;
  return new Date(Date.now() + expiresInSeconds * 1000);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Exchange whatever token we hold for a fresh long-lived one (~60 days). Works
// while the current token is still valid, which is why the refresh worker runs
// well before expiry rather than after.
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

type PageWithInstagram = {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string; username?: string };
};

// The app-scoped Facebook user id behind this login. It is what Meta sends
// in the deauthorize and data-deletion callbacks (`user_id`), and the Page
// tokens we store carry no link back to it — so it is captured once, here,
// and kept in each connection's metadata. Without it a deletion request
// could not be matched to the rows it is about.
async function metaUserId(userToken: string): Promise<string> {
  const me = await graph<{ id: string }>("/me", {
    searchParams: { fields: "id", access_token: userToken },
  });
  return me.id;
}

// What the user actually granted — Meta's token response does not say, and
// a user can untick a permission on the consent screen. Stored on the
// connection so the automations page can tell "messaging not granted" from
// "engine broken". Falls back to the requested set if debug_token fails.
async function grantedScopes(userToken: string, requested: string[]): Promise<string[]> {
  try {
    const out = await graph<{ data?: { scopes?: string[] } }>("/debug_token", {
      searchParams: {
        input_token: userToken,
        access_token: `${requireEnv("META_APP_ID")}|${requireEnv("META_APP_SECRET")}`,
      },
    });
    return Array.isArray(out.data?.scopes) && out.data.scopes.length > 0 ? out.data.scopes : requested;
  } catch {
    return requested;
  }
}

async function listInstagramAccounts(
  userToken: string,
  scopes: string[],
): Promise<{ accounts: ConnectedAccount[]; pagesSeen: string[] }> {
  const accounts: ConnectedAccount[] = [];
  const fbUserId = await metaUserId(userToken);
  // Tracked so the failure message can distinguish "you manage no Pages" from
  // "you manage Pages but none has an Instagram account linked" — very
  // different fixes, and the first attempt at this hit the second one.
  const pagesSeen: string[] = [];
  let path =
    `/me/accounts?fields=id,name,access_token,` +
    `instagram_business_account{id,username}&limit=50`;

  // Paginate defensively; most users have one Page, agencies have many.
  for (let page = 0; page < 10 && path; page++) {
    const out = await graph<{
      data: PageWithInstagram[];
      paging?: { next?: string };
    }>(path, { searchParams: { access_token: userToken } });

    for (const fbPage of out.data ?? []) {
      pagesSeen.push(fbPage.name);
      if (!fbPage.instagram_business_account) continue;
      accounts.push({
        platformAccountId: fbPage.instagram_business_account.id,
        platformAccountName: fbPage.instagram_business_account.username,
        // Page tokens derived from a long-lived user token do not expire, and
        // Phase 4 webhook/messaging calls need them — store per account.
        tokens: { accessToken: fbPage.access_token, scopes },
        metadata: { pageId: fbPage.id, pageName: fbPage.name, metaUserId: fbUserId },
      });
    }

    const next = out.paging?.next;
    path = next ? next.replace(GRAPH, "") : "";
  }

  return { accounts, pagesSeen };
}

// Create a media container and wait until Meta reports it ready to publish.
async function createContainer(
  igUserId: string,
  token: string,
  params: Record<string, string>,
  hasVideo: boolean,
): Promise<string> {
  const container = await graph<{ id: string }>(`/${igUserId}/media`, {
    method: "POST",
    searchParams: { ...params, access_token: token },
  });

  // Images are typically FINISHED on the first check; a video has to be
  // fetched from our storage and transcoded, which is why the budget differs.
  const budgetMs = pollTotalMs(hasVideo);
  const delays = pollDelays(budgetMs);

  for (const delay of delays) {
    const status = await graph<{ status_code?: string; status?: string }>(
      `/${container.id}`,
      { searchParams: { fields: "status_code,status", access_token: token } },
    );
    if (status.status_code === "FINISHED") return container.id;
    if (status.status_code === "ERROR" || status.status_code === "EXPIRED") {
      // Meta's `status` carries a sentence explaining what it disliked —
      // aspect ratio, duration, codec. Far more use than our own guess.
      throw new PlatformApiError(
        "instagram",
        `media container ${status.status_code.toLowerCase()}` +
          (status.status ? `: ${status.status}` : " (check media URL and format)"),
      );
    }
    await sleep(delay);
  }

  // Container id included on purpose: without it a timeout can only be
  // diagnosed by reproducing the whole publish, which is how this limit was
  // found in the first place.
  throw new PlatformApiError(
    "instagram",
    `media still processing after ${Math.round(budgetMs / 1000)}s ` +
      `(container ${container.id}) — try posting it again`,
    true,
  );
}

// Reading the connected Instagram Business account itself, for the home
// screen. Two honest limits, both visible on the screen rather than papered
// over: the media edge carries likes and comments but NOT plays (views need
// the per-media insights edge, one call per post, and a permission this app
// has not requested), and a carousel reports one entry rather than one per
// image. So Instagram's cards are labelled with likes.
const instagramInsights: AccountInsights = {
  primaryMetric: "likes",
  metered: false,
  requiredScopes: ["instagram_basic"],

  async readProfile({ tokens, platformAccountId }) {
    const out = await graph<{
      username?: string;
      name?: string;
      biography?: string;
      profile_picture_url?: string;
      followers_count?: number;
      follows_count?: number;
      media_count?: number;
    }>(`/${platformAccountId}`, {
      searchParams: {
        fields:
          "username,name,biography,profile_picture_url,followers_count,follows_count,media_count",
        access_token: tokens.accessToken,
      },
    });

    const profile: AccountProfile = {
      handle: out.username,
      displayName: out.name ?? out.username,
      avatarUrl: out.profile_picture_url,
      bio: out.biography,
      profileUrl: out.username
        ? `https://www.instagram.com/${out.username}/`
        : undefined,
      followers: out.followers_count ?? null,
      following: out.follows_count ?? null,
      postCount: out.media_count ?? null,
    };
    return profile;
  },

  async listMedia({ tokens, platformAccountId, limit = 36 }) {
    const out = await graph<{
      data?: {
        id: string;
        caption?: string;
        media_type?: string;
        media_product_type?: string;
        permalink?: string;
        thumbnail_url?: string;
        media_url?: string;
        timestamp?: string;
        like_count?: number;
        comments_count?: number;
      }[];
    }>(`/${platformAccountId}/media`, {
      searchParams: {
        fields:
          "id,caption,media_type,media_product_type,permalink,thumbnail_url," +
          "media_url,timestamp,like_count,comments_count",
        limit: String(Math.min(Math.max(limit, 1), 50)),
        access_token: tokens.accessToken,
      },
    });

    return (out.data ?? []).map((m): AccountMediaItem => ({
      externalId: m.id,
      kind: m.media_type === "VIDEO" ? "video" : "photo",
      caption: m.caption,
      permalink: m.permalink,
      // Videos carry thumbnail_url; images only media_url.
      thumbnailUrl:
        m.thumbnail_url ?? (m.media_type === "VIDEO" ? undefined : m.media_url),
      postedAt: m.timestamp,
      // No durationSeconds: the Instagram media edge does not report video
      // length at any version — `media_product_type` says REELS or FEED, which
      // is a placement and not a duration. So Instagram videos stay unknown and
      // appear under All rather than being guessed into Short or Long. Same for
      // Facebook and Threads. Only YouTube, TikTok and X tell us.
      views: null,
      likes: m.like_count ?? null,
      comments: m.comments_count ?? null,
      shares: null,
    }));
  },
};

export const instagram: PlatformAdapter = {
  id: "instagram",
  displayName: "Instagram",
  requiredEnv: ["META_APP_ID", "META_APP_SECRET"],
  insights: instagramInsights,
  refreshPolicy: "sweep",
  capabilities: {
    text: false, // no text-only posts on Instagram
    image: true,
    video: true,
    carousel: true,
    schedule: true,
    analytics: true,
  },

  // Content Publishing API limits: 2,200-character captions, 30 hashtags,
  // carousels of 2–10 items mixing images and video freely.
  rules: {
    captionMaxChars: 2200,
    mediaMax: 10,
    maxVideos: null,
    mixedMediaAllowed: true,
    hashtagMax: 30,
  },

  getAuthorizeUrl({ redirectUri, state, features }) {
    const scopes = features?.includes("messaging")
      ? [...OAUTH_SCOPES, ...MESSAGING_SCOPES]
      : OAUTH_SCOPES;
    const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
    url.searchParams.set("client_id", requireEnv("META_APP_ID"));
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", scopes.join(","));
    return url.toString();
  },

  async connect({ code, redirectUri, features }) {
    // Leg 2: the callback code becomes a short-lived user token.
    const short = await graph<{ access_token: string; expires_in?: number }>(
      "/oauth/access_token",
      {
        searchParams: {
          client_id: requireEnv("META_APP_ID"),
          client_secret: requireEnv("META_APP_SECRET"),
          redirect_uri: redirectUri,
          code,
        },
      },
    );

    // Then straight to long-lived (~60 days) — the short token is never stored.
    const tokens = await exchangeForLongLived(short.access_token);
    const requested = features?.includes("messaging")
      ? [...OAUTH_SCOPES, ...MESSAGING_SCOPES]
      : OAUTH_SCOPES;
    const scopes = await grantedScopes(tokens.accessToken, requested);
    tokens.scopes = scopes;
    const { accounts, pagesSeen } = await listInstagramAccounts(tokens.accessToken, scopes);

    if (accounts.length === 0) {
      // Name the actual situation: the fix differs entirely depending on
      // whether any Pages came back.
      throw new PlatformApiError(
        "instagram",
        pagesSeen.length === 0
          ? "This Facebook login manages no Pages. Create a Page, then link " +
              "your Instagram Business account to it."
          : `Found ${pagesSeen.length} Page(s) — ${pagesSeen.join(", ")} — but ` +
              "none has an Instagram account linked. Link it in Business " +
              "Suite under Instagram accounts, then try again. Switching " +
              "Instagram to a Business account is not the same as linking it.",
      );
    }

    return { tokens, accounts };
  },

  async refresh(tokens) {
    return exchangeForLongLived(tokens.accessToken);
  },

  // The Instagram Messaging API, with the Page token each connection stores.
  // Every call is POST /{ig-user-id}/messages (or /{comment-id}/replies for
  // the public reply); the engine owns the 24-hour window, the plan cap,
  // dedupe, and retries — this just speaks the wire format.
  messaging: {
    requiredScopes: MESSAGING_SCOPES,

    async sendPrivateReply({ tokens, platformAccountId, commentId, text }) {
      const out = await graph<{ message_id?: string }>(`/${platformAccountId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { comment_id: commentId },
          message: { text: text.slice(0, 1000) },
        }),
        searchParams: { access_token: tokens.accessToken },
      });
      return { messageId: out.message_id };
    },

    async sendMessage({ tokens, platformAccountId, recipientId, text, buttons }) {
      const send = (message: Record<string, unknown>) =>
        graph<{ message_id?: string }>(`/${platformAccountId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipient: { id: recipientId }, message }),
          searchParams: { access_token: tokens.accessToken },
        });

      const first = await send({ text: text.slice(0, 1000) });
      if (!buttons || buttons.length === 0) return { messageId: first.message_id };

      // Links ride a generic template (Instagram has no button template);
      // the element title is the first button's title so the card reads as
      // the call to action. Up to three web_url buttons per element.
      const out = await send({
        attachment: {
          type: "template",
          payload: {
            template_type: "generic",
            elements: [
              {
                title: buttons[0].title.slice(0, 80),
                buttons: buttons.slice(0, 3).map((b) => ({
                  type: "web_url",
                  url: b.url,
                  title: b.title.slice(0, 20),
                })),
              },
            ],
          },
        },
      });
      return { messageId: out.message_id ?? first.message_id };
    },

    async replyToComment({ tokens, commentId, text }) {
      const out = await graph<{ id?: string }>(`/${commentId}/replies`, {
        method: "POST",
        searchParams: { message: text.slice(0, 2200), access_token: tokens.accessToken },
      });
      return { replyId: out.id };
    },

    // For an Instagram account reached through Facebook Login, webhooks
    // flow once the app is subscribed to the Page linked to it — any Page
    // field will do; the Instagram fields (comments, messages) are chosen on
    // the app's Webhooks product, once, by the owner. Idempotent.
    async listRecentPosts({ tokens, platformAccountId, limit = 24 }) {
      const out = await graph<{
        data?: {
          id: string;
          caption?: string;
          permalink?: string;
          thumbnail_url?: string;
          media_url?: string;
          media_type?: string;
          timestamp?: string;
        }[];
      }>(`/${platformAccountId}/media`, {
        searchParams: {
          fields: "id,caption,permalink,thumbnail_url,media_url,media_type,timestamp",
          limit: String(Math.min(Math.max(limit, 1), 50)),
          access_token: tokens.accessToken,
        },
      });
      return (out.data ?? []).map((m) => ({
        id: m.id,
        caption: m.caption,
        permalink: m.permalink,
        // Videos carry thumbnail_url; images only media_url.
        thumbnailUrl: m.thumbnail_url ?? (m.media_type === "VIDEO" ? undefined : m.media_url),
        mediaType: m.media_type,
        timestamp: m.timestamp,
      }));
    },

    async subscribeWebhooks({ tokens, metadata }) {
      const pageId = typeof metadata.pageId === "string" ? metadata.pageId : null;
      if (!pageId) {
        throw new PlatformApiError("instagram", "no Page id on this connection — reconnect it");
      }
      await graph(`/${pageId}/subscribed_apps`, {
        method: "POST",
        searchParams: { subscribed_fields: "feed", access_token: tokens.accessToken },
      });
    },
  },

  async publish({ caption, media, tokens, platformAccountId, options }) {
    if (media.length === 0) {
      throw new PlatformApiError(
        "instagram",
        "Instagram requires at least one image or video",
      );
    }

    const token = tokens.accessToken;
    const audioName = optionValue("instagram", options, "audio_name");
    let creationId: string;

    if (media.length === 1) {
      const item = media[0];
      creationId = await createContainer(
        platformAccountId,
        token,
        item.type === "video"
          ? {
              media_type: "REELS",
              video_url: item.url,
              caption,
              // Only meaningful on a single reel. Instagram's default is to
              // show it in the grid too, so the flag is sent only to turn
              // that off.
              ...(optionValue("instagram", options, "profile_display") ===
              "reels_only"
                ? { share_to_feed: "false" }
                : {}),
              ...(typeof audioName === "string" && audioName
                ? { audio_name: audioName }
                : {}),
              // Sent only when asked for. Instagram's trials are newer than
              // the publishing API, so this may be ignored — Graph drops
              // parameters it does not know rather than failing, which is why
              // sending it cannot break the post.
              ...(optionValue("instagram", options, "is_trial") === true
                ? { is_trial: "true" }
                : {}),
            }
          : { image_url: item.url, caption },
        item.type === "video",
      );
    } else {
      // Carousel: one child container per item, then a parent that owns them.
      const children: string[] = [];
      for (const item of media.slice(0, 10)) {
        children.push(
          await createContainer(
            platformAccountId,
            token,
            item.type === "video"
              ? {
                  media_type: "VIDEO",
                  video_url: item.url,
                  is_carousel_item: "true",
                }
              : { image_url: item.url, is_carousel_item: "true" },
            item.type === "video",
          ),
        );
      }
      // The children are already processed; the parent only groups them.
      creationId = await createContainer(
        platformAccountId,
        token,
        { media_type: "CAROUSEL", children: children.join(","), caption },
        false,
      );
    }

    const published = await graph<{ id: string }>(
      `/${platformAccountId}/media_publish`,
      {
        method: "POST",
        searchParams: { creation_id: creationId, access_token: token },
      },
    );

    const result: PublishResult = { platformPostId: published.id };

    // Comments are not something the container accepts: Instagram only takes
    // the switch once the media exists. Off is the only value worth sending,
    // since on is already the default.
    if (optionValue("instagram", options, "comment_enabled") === false) {
      try {
        await graph(`/${published.id}`, {
          method: "POST",
          searchParams: { comment_enabled: "false", access_token: token },
        });
      } catch {
        // The reel is live. Failing the whole post because comments stayed on
        // would be a worse answer than a published reel with comments on, and
        // the person can switch them off in the app.
      }
    }

    try {
      const permalink = await graph<{ permalink?: string }>(`/${published.id}`, {
        searchParams: { fields: "permalink", access_token: token },
      });
      if (permalink.permalink) result.url = permalink.permalink;
    } catch {
      // The post succeeded; a missing permalink is not worth failing over.
    }
    return result;
  },
};
