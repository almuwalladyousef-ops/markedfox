import { createHash, createHmac } from "node:crypto";

import { requireEnv } from "@/lib/env";

import { PlatformApiError, PlatformAuthError } from "./errors";
import { optionValue } from "./publish-options";
import type {
  AccountInsights,
  AccountMediaItem,
  AccountProfile,
  ConnectionTokens,
  PlatformAdapter,
} from "./types";

// X (Twitter) API v2, pay-per-use tier (the only tier open to new developers
// since Feb 2026: $0.015 per post, $0.20 per post containing a URL — which is
// why containsExternalLink() blocks URLs server-side, a 13x cost control).
//
// Caption-field only, by locked decision (CLAUDE.md): text posts, no media.
// That makes this the simplest adapter in the registry — one POST /2/tweets.
//
// OAuth 2.0 authorization-code with PKCE is the ONLY user-context grant X
// supports. We register as a CONFIDENTIAL client (web app), so token calls
// carry Basic auth; PKCE is still mandatory on top. Our OAuth dance is
// stateless server-side, so instead of storing a code_verifier between legs,
// we DERIVE it from the signed state string both legs already share:
//
//   verifier  = hex(hmac-sha256(key = X_CLIENT_SECRET, msg = state))   64 chars
//   challenge = base64url(sha256(verifier))                            S256
//
// The secret in the HMAC matters: state rides the callback URL next to the
// code, so a verifier derivable from state alone would give an interceptor
// both halves at once.
//
// Billing is prepaid credits on the app (console.x.com) — no per-request
// header. An empty balance fails API calls, so the owner keeps auto-recharge
// on; Phase 6 adds balance monitoring.

const AUTHORIZE = "https://x.com/i/oauth2/authorize";
const API = "https://api.x.com/2";

const OAUTH_SCOPES = ["tweet.read", "tweet.write", "users.read", "offline.access"];

function pkceVerifier(state: string): string {
  return createHmac("sha256", requireEnv("X_CLIENT_SECRET"))
    .update(state)
    .digest("hex");
}

function basicAuth(): string {
  const raw = `${requireEnv("X_CLIENT_ID")}:${requireEnv("X_CLIENT_SECRET")}`;
  return `Basic ${Buffer.from(raw).toString("base64")}`;
}

// v2 errors come in two shapes: problem-JSON with an `errors` array for
// request-level trouble, and a bare {title, status} for auth failures.
type XErrorBody = {
  title?: string;
  detail?: string;
  status?: number;
  errors?: { title?: string; detail?: string; message?: string }[];
  error?: string;
  error_description?: string;
};

// What X's token endpoint says about a refresh token that is dead — expired,
// revoked, or already redeemed (they are single-use). These arrive as HTTP
// 400, not 401: treating them as generic API errors would leave a dead
// connection `active` and retrying forever instead of asking for a reconnect.
const TOKEN_DEAD_GRANT_CODES = new Set([
  "invalid_request", // "Value passed for the token was invalid."
  "invalid_grant",
  "unauthorized_client",
]);

async function xFetch<T>(
  path: string,
  init: RequestInit & { auth: string; tokenEndpoint?: boolean },
): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: init.auth, ...init.headers },
    body: init.body,
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await response.json().catch(() => ({}))) as T & XErrorBody;

  if (!response.ok) {
    const detail =
      body.detail ??
      body.error_description ??
      body.errors?.[0]?.detail ??
      body.errors?.[0]?.message ??
      body.title ??
      body.error ??
      `HTTP ${response.status}`;
    if (response.status === 401) {
      // Expired/revoked token. The caller refreshes or marks the connection.
      throw new PlatformAuthError("x", detail);
    }
    if (
      init.tokenEndpoint &&
      response.status === 400 &&
      body.error &&
      TOKEN_DEAD_GRANT_CODES.has(body.error)
    ) {
      throw new PlatformAuthError("x", detail);
    }
    // 429 = rate limited (100 posts/15min per user, 10k/24h per app — the app
    // budget is shared by every MarkedFox user, same as Meta's).
    throw new PlatformApiError("x", detail, response.status === 429 || response.status >= 500);
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
    refreshToken: out.refresh_token,
    // Access tokens live 2 hours; publish-time refresh is the norm here.
    expiresAt: out.expires_in
      ? new Date(Date.now() + out.expires_in * 1000)
      : undefined,
    scopes: out.scope ? out.scope.split(" ") : OAUTH_SCOPES,
  };
}

async function tokenCall(form: URLSearchParams): Promise<ConnectionTokens> {
  return toTokens(
    await xFetch<{
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    }>("/oauth2/token", {
      method: "POST",
      tokenEndpoint: true,
      auth: basicAuth(),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    }),
  );
}

// X is the one metered read in the product: the API bills per request, the
// same reason posting to X carries a hard monthly cap on every plan. So
// `metered` is true and the background sweep skips it — X refreshes only when
// somebody presses the button, and the screen says why.
const xInsights: AccountInsights = {
  primaryMetric: "views",
  metered: true,
  requiredScopes: ["users.read", "tweet.read"],

  async readProfile({ tokens }) {
    const out = await xFetch<{
      data?: {
        id?: string;
        name?: string;
        username?: string;
        description?: string;
        profile_image_url?: string;
        public_metrics?: {
          followers_count?: number;
          following_count?: number;
          tweet_count?: number;
        };
      };
    }>(
      "/users/me?user.fields=description,profile_image_url,public_metrics",
      { auth: `Bearer ${tokens.accessToken}` },
    );

    const user = out.data ?? {};
    const profile: AccountProfile = {
      handle: user.username,
      displayName: user.name,
      // _normal is a 48px avatar; _400x400 is the same file at a usable size.
      avatarUrl: user.profile_image_url?.replace("_normal", "_400x400"),
      bio: user.description,
      profileUrl: user.username ? `https://x.com/${user.username}` : undefined,
      followers: user.public_metrics?.followers_count ?? null,
      following: user.public_metrics?.following_count ?? null,
      postCount: user.public_metrics?.tweet_count ?? null,
    };
    return profile;
  },

  async listMedia({ tokens, platformAccountId, limit = 20 }) {
    const out = await xFetch<{
      data?: {
        id: string;
        text?: string;
        created_at?: string;
        attachments?: { media_keys?: string[] };
        public_metrics?: {
          like_count?: number;
          reply_count?: number;
          retweet_count?: number;
          impression_count?: number;
        };
      }[];
      includes?: {
        media?: {
          media_key: string;
          type?: string;
          url?: string;
          preview_image_url?: string;
          /** Milliseconds, and only on `video` — an animated_gif has none. */
          duration_ms?: number;
        }[];
      };
    }>(
      `/users/${encodeURIComponent(platformAccountId)}/tweets` +
        `?max_results=${Math.min(Math.max(limit, 5), 100)}` +
        "&exclude=retweets,replies" +
        "&tweet.fields=created_at,public_metrics,attachments" +
        "&expansions=attachments.media_keys" +
        "&media.fields=type,url,preview_image_url,duration_ms",
      { auth: `Bearer ${tokens.accessToken}` },
    );

    const media = new Map(
      (out.includes?.media ?? []).map((item) => [item.media_key, item]),
    );

    return (out.data ?? []).map((post): AccountMediaItem => {
      const attached = post.attachments?.media_keys
        ?.map((key) => media.get(key))
        .find(Boolean);
      return {
        externalId: post.id,
        kind:
          attached?.type === "video" || attached?.type === "animated_gif"
            ? "video"
            : attached
              ? "photo"
              : "text",
        caption: post.text,
        permalink: `https://x.com/i/web/status/${post.id}`,
        thumbnailUrl: attached?.url ?? attached?.preview_image_url,
        durationSeconds:
          typeof attached?.duration_ms === "number" && attached.duration_ms > 0
            ? Math.round(attached.duration_ms / 1000)
            : null,
        postedAt: post.created_at,
        // impression_count is only returned for the authenticated user's own
        // posts, which is precisely what this reads.
        views: post.public_metrics?.impression_count ?? null,
        likes: post.public_metrics?.like_count ?? null,
        comments: post.public_metrics?.reply_count ?? null,
        shares: post.public_metrics?.retweet_count ?? null,
      };
    });
  },
};

export const x: PlatformAdapter = {
  id: "x",
  displayName: "X",
  requiredEnv: ["X_CLIENT_ID", "X_CLIENT_SECRET"],
  insights: xInsights,
  refreshPolicy: "on-use",
  capabilities: {
    text: true,
    image: false, // caption-field only — locked decision, not a TODO
    video: false,
    carousel: false,
    schedule: true,
    analytics: false,
  },

  // 280 characters for standard accounts. X counts emoji and CJK as 2 and
  // wraps every URL to 23 t.co characters; our validator counts code points,
  // so an emoji-heavy caption can pass here and still be refused by X — the
  // publish error names the real reason. URLs are moot: they are blocked
  // upstream by the cost guard before any length question arises.
  rules: {
    captionMaxChars: 280,
    mediaMax: 1,
    maxVideos: null,
    mixedMediaAllowed: false,
    hashtagMax: null,
  },

  getAuthorizeUrl({ redirectUri, state }) {
    const challenge = createHash("sha256")
      .update(pkceVerifier(state))
      .digest("base64url");

    const url = new URL(AUTHORIZE);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", requireEnv("X_CLIENT_ID"));
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("scope", OAUTH_SCOPES.join(" ")); // space-separated here
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url.toString();
  },

  async connect({ code, redirectUri, state }) {
    if (!state) {
      // Cannot happen through our callback route, which always passes it —
      // but the verifier is derived from state, so fail loudly, not weirdly.
      throw new PlatformApiError("x", "missing OAuth state for PKCE");
    }

    const tokens = await tokenCall(
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: pkceVerifier(state),
      }),
    );

    const me = await xFetch<{ data: { id: string; username: string; name?: string } }>(
      "/users/me",
      { auth: `Bearer ${tokens.accessToken}` },
    );

    return {
      tokens,
      accounts: [
        {
          platformAccountId: me.data.id,
          platformAccountName: me.data.username,
          metadata: { username: me.data.username },
        },
      ],
    };
  },

  // Refresh tokens are SINGLE-USE and rotate: every refresh returns a new
  // access/refresh pair and invalidates the old refresh token. The store
  // persists whatever this returns, which is exactly why refreshToken is
  // always included. Losing the returned pair (a crash between refresh and
  // persist) bricks the connection until the user reconnects — rare, and the
  // UI's "reconnect needed" state covers it.
  async refresh(tokens) {
    if (!tokens.refreshToken) {
      throw new PlatformAuthError("x", "no refresh token stored — reconnect this account");
    }
    return tokenCall(
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokens.refreshToken,
      }),
    );
  },

  // POST /2/oauth2/revoke invalidates one token; revoking the refresh token
  // takes its access tokens with it. Confidential client, so Basic auth.
  async revoke(tokens) {
    const token = tokens.refreshToken ?? tokens.accessToken;
    await xFetch("/oauth2/revoke", {
      method: "POST",
      tokenEndpoint: true,
      auth: basicAuth(),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        token,
        client_id: requireEnv("X_CLIENT_ID"),
        token_type_hint: tokens.refreshToken ? "refresh_token" : "access_token",
      }).toString(),
    });
  },

  async publish({ caption, media, tokens, options }) {
    if (media.length > 0) {
      // The composer and API validator both block this; the guard is for
      // callers that bypass them.
      throw new PlatformApiError("x", "X posts are caption-only on MarkedFox");
    }

    const out = await xFetch<{ data: { id: string; text: string } }>("/tweets", {
      method: "POST",
      auth: `Bearer ${tokens.accessToken}`,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: caption,
        // Omitted rather than defaulted when the user did not choose: X's own
        // default is "everyone", and sending it explicitly would be us making
        // the choice on their behalf for no gain.
        ...(optionValue("x", options, "reply_settings") &&
        optionValue("x", options, "reply_settings") !== "everyone"
          ? { reply_settings: String(optionValue("x", options, "reply_settings")) }
          : {}),
      }),
    });

    return {
      platformPostId: out.data.id,
      // Resolves without knowing the username; X redirects to the canonical
      // /{username}/status/{id} form.
      url: `https://x.com/i/web/status/${out.data.id}`,
    };
  },
};
