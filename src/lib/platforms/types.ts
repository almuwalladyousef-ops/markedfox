// Every platform the product will ever gate by plan. Must stay in lockstep
// with the `platform` enum in the initial schema migration.
export const PLATFORMS = [
  "instagram",
  "x",
  "threads",
  "facebook",
  "tiktok",
  "youtube",
  "snapchat",
  "linkedin",
  "pinterest",
] as const;

export type Platform = (typeof PLATFORMS)[number];

export interface PlatformCapabilities {
  text: boolean;
  image: boolean;
  video: boolean;
  carousel: boolean;
  schedule: boolean;
  analytics: boolean;
}

export interface ConnectionTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes?: string[];
}

export interface ConnectedAccount {
  platformAccountId: string;
  platformAccountName?: string;
  /** Per-account token override (e.g. Meta Page tokens). Falls back to the
   *  top-level user tokens when absent. */
  tokens?: ConnectionTokens;
  metadata?: Record<string, unknown>;
}

// One OAuth dance can surface several accounts — a Meta login returns every
// Page/Instagram pair the user manages, and "many accounts per platform per
// user" is a hard product requirement. The callback stores one connection row
// per account.
export interface ConnectResult {
  tokens: ConnectionTokens;
  accounts: ConnectedAccount[];
}

export interface MediaRef {
  url: string;
  type: "image" | "video";
  mime?: string;
  /**
   * Size of the file, as the browser reported it when it was uploaded.
   *
   * Only used to explain a refusal in words the user can act on ("that clip
   * is 12GB"). It is never the thing that enforces a limit — the size a tab
   * claims is the size a tab chose to claim. What actually bounds an upload
   * is that we sign exactly the parts we are willing to accept, and that a
   * single PUT cannot exceed R2's own 5GiB ceiling.
   */
  bytes?: number;
}

// Per-platform publish options the user chose in the composer — TikTok's
// privacy level and disclosure toggles, for instance. Flat JSON primitives
// only, stored in scheduled_posts.platform_overrides[platform].options.
export type PlatformPublishOptions = Record<string, string | number | boolean>;

export interface PublishInput {
  caption: string;
  media: MediaRef[];
  tokens: ConnectionTokens;
  platformAccountId: string;
  options?: PlatformPublishOptions;
}

export interface PublishResult {
  platformPostId: string;
  url?: string;
}

// The numbers behind "surface invalid content before publish, never as an
// error after". Declarative on purpose: the composer receives these as plain
// data and runs the same validateContent() the API runs, so the two can never
// disagree — and adding a platform means declaring its limits in its own
// adapter file, not editing a shared table.
//
// Capabilities say what a platform can carry (text-only? video? carousel?);
// rules say how much. Both are read by src/lib/publish/validate.ts.
export interface ContentRules {
  /** Hard platform limit on caption/text length, in code points. */
  captionMaxChars: number;
  /** Most media items in one post (carousel size). 1 = single item only. */
  mediaMax: number;
  /** Most videos in one post, or null for no separate video limit. */
  maxVideos: number | null;
  /** Images and videos together in one post. */
  mixedMediaAllowed: boolean;
  /** Hashtag cap inside the caption, or null when the platform has none. */
  hashtagMax: number | null;
}

// Optional permission sets a connect can ask for on top of publishing.
export type PlatformFeature = "messaging";

// What the DM engine asks of a platform. Every call is one send; the engine
// owns queueing, windows, caps, retries, and analytics.
export interface MessagingCapability {
  /** The scopes the platform must have granted for the engine to work here. */
  readonly requiredScopes: readonly string[];
  /** The one DM a platform allows in answer to a comment. */
  sendPrivateReply(input: {
    tokens: ConnectionTokens;
    platformAccountId: string;
    commentId: string;
    text: string;
  }): Promise<{ messageId?: string }>;
  /** A DM to someone inside the platform's messaging window. */
  sendMessage(input: {
    tokens: ConnectionTokens;
    platformAccountId: string;
    recipientId: string;
    text: string;
    buttons?: { title: string; url: string }[];
  }): Promise<{ messageId?: string }>;
  /** A public reply under a comment. */
  replyToComment(input: {
    tokens: ConnectionTokens;
    platformAccountId: string;
    commentId: string;
    text: string;
  }): Promise<{ replyId?: string }>;
  /** Make the platform deliver this account's events to our webhook. Called
   *  at connect and from the automations page; idempotent. */
  subscribeWebhooks(input: {
    tokens: ConnectionTokens;
    platformAccountId: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;
  /** Recent posts, so a rule can be aimed at specific ones. */
  listRecentPosts(input: {
    tokens: ConnectionTokens;
    platformAccountId: string;
    limit?: number;
  }): Promise<RecentPost[]>;
}

export type RecentPost = {
  id: string;
  caption?: string;
  permalink?: string;
  thumbnailUrl?: string;
  mediaType?: string;
  timestamp?: string;
};

// ── what an account looks like on its own platform ─────────────────────────
// The home screen shows every connected account the way its own platform
// shows it: followers, total posts, and the recent grid with the number each
// platform actually publishes. That number is not the same everywhere, which
// is why `primaryMetric` is declared rather than assumed — Instagram business
// reads carry likes, TikTok and YouTube carry views, and a card that labelled
// likes as views would be lying in a way nobody could catch.

export interface AccountProfile {
  /** @handle without the @. */
  handle?: string;
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
  /** The account's page on its own platform, for "open profile". */
  profileUrl?: string;
  /** null means the platform does not expose the number, which is different
   *  from zero and is rendered as "—" rather than "0". */
  followers?: number | null;
  following?: number | null;
  postCount?: number | null;
}

export type AccountMediaKind = "video" | "photo" | "text";

export interface AccountMediaItem {
  /** The platform's own id for this post. Unique per connection. */
  externalId: string;
  kind: AccountMediaKind;
  caption?: string;
  permalink?: string;
  thumbnailUrl?: string;
  /** ISO 8601. Absent posts sort last rather than to 1970. */
  postedAt?: string;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
}

// Reading a connected account's own profile and recent posts. Optional on the
// adapter: a platform with no read API (Snapchat) simply does not have one,
// and the home screen says so in a sentence instead of showing an empty grid.
export interface AccountInsights {
  /** Which number the grid puts on a card for this platform. */
  readonly primaryMetric: "views" | "likes";
  /** What this platform calls the people who follow the account. Declared
   *  rather than assumed for the same reason `primaryMetric` is: YouTube has
   *  subscribers, not followers, and a header that says "followers" over a
   *  YouTube subscriber count is using the wrong word for the platform's own
   *  number. Optional — "followers" is right nearly everywhere. */
  readonly followersLabel?: string;
  /** True when every read costs money — X bills per request. Metered
   *  platforms are never swept in the background; the user asks for them. */
  readonly metered: boolean;
  /** Scopes the connection must hold. A connection authorized before these
   *  existed reads as "reconnect to include stats" rather than failing. */
  readonly requiredScopes: readonly string[];
  readProfile(input: {
    tokens: ConnectionTokens;
    platformAccountId: string;
    metadata?: Record<string, unknown>;
  }): Promise<AccountProfile>;
  listMedia(input: {
    tokens: ConnectionTokens;
    platformAccountId: string;
    metadata?: Record<string, unknown>;
    limit?: number;
  }): Promise<AccountMediaItem[]>;
}

// One adapter per platform, one file per adapter, registered in registry.ts.
// Routes never contain platform-specific code: they resolve an adapter and
// call it.
export interface PlatformAdapter {
  readonly id: Platform;
  readonly displayName: string;
  readonly capabilities: PlatformCapabilities;
  readonly rules: ContentRules;
  /** Env vars this adapter cannot work without. The dashboard shows a
   *  registered-but-unconfigured platform as "coming soon" instead of a
   *  toggle that would 500 on click — the owner creates each platform's
   *  developer app on their own schedule. */
  readonly requiredEnv: readonly string[];
  /** How tokens stay alive.
   *
   *  "sweep"  — the credential we store IS the thing that expires (Meta and
   *             Threads 60-day tokens): the scheduler's sweep renews it ahead
   *             of expiry, or a dormant account dies.
   *  "on-use" — short access token + long-lived refresh token (X 2h/~6mo,
   *             YouTube 1h/non-expiring, TikTok 24h/365d, Snapchat 1h):
   *             getFreshConnectionTokens refreshes just-in-time at publish.
   *             Sweeping these on token_expires_at would refresh every such
   *             connection on every tick, minutely, forever.
   *
   *  Known gap, accepted until Phase 6: an "on-use" connection nobody
   *  publishes from can outlive its refresh token (X ~6 months, YouTube after
   *  6 months of non-use) and then needs reconnecting by hand. */
  readonly refreshPolicy: "sweep" | "on-use";
  /** OAuth leg 1: the URL the user is sent to. `features` asks for optional
   *  permission sets beyond publishing — "messaging" adds the DM/comment
   *  scopes so the automation engine can act for this account. */
  getAuthorizeUrl(input: { redirectUri: string; state: string; features?: PlatformFeature[] }): string;
  /** OAuth leg 2: exchange the callback code for tokens + account identity.
   *  `state` is the exact string echoed by the provider — adapters that need
   *  PKCE (X) derive their code_verifier from it instead of storing one. */
  connect(input: {
    code: string;
    redirectUri: string;
    state?: string;
    /** The feature set leg 1 asked for, so leg 2 knows what was requested. */
    features?: PlatformFeature[];
  }): Promise<ConnectResult>;
  /** Server-side token refresh so background jobs never hold stale tokens. */
  refresh(tokens: ConnectionTokens): Promise<ConnectionTokens>;
  publish(input: PublishInput): Promise<PublishResult>;
  /** Live facts the composer needs before a post to this platform can be
   *  configured — TikTok's creator_info (who the post goes to, which privacy
   *  levels they may use, which interactions are disabled). Optional; most
   *  platforms need nothing. Served by GET /api/connections/[id]/publish-context. */
  getPublishContext?(tokens: ConnectionTokens): Promise<Record<string, unknown>>;
  /** Validate the per-platform options for a post. Pure. Runs in the API at
   *  create time (no context) and is shared with the composer; returns the
   *  reasons the post cannot go out, in the user's words. */
  validateOptions?(
    options: PlatformPublishOptions | undefined,
    context?: Record<string, unknown> | null,
    input?: { hasVideo?: boolean },
  ): string[];
  /** DM and comment automation for this platform, when the API supports it
   *  (Instagram via the Messaging API; Facebook Pages later). Absent means the
   *  automation engine has nothing to drive here. */
  readonly messaging?: MessagingCapability;
  /** Reading this account's own profile and recent posts, for the home
   *  screen. Absent means the platform has no read API we can use. */
  readonly insights?: AccountInsights;
  /** Tell the platform to invalidate this grant, when it offers a per-token
   *  revoke endpoint (X, Google, TikTok). Optional and best-effort: the
   *  disconnect that calls it deletes our copy of the token regardless, and
   *  Meta's only revoke is app-wide, which would disconnect every Page and
   *  Instagram account the user has, not the one they clicked. */
  revoke?(tokens: ConnectionTokens): Promise<void>;
}
