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
}

export interface PublishInput {
  caption: string;
  media: MediaRef[];
  tokens: ConnectionTokens;
  platformAccountId: string;
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
  /** OAuth leg 1: the URL the user is sent to. */
  getAuthorizeUrl(input: { redirectUri: string; state: string }): string;
  /** OAuth leg 2: exchange the callback code for tokens + account identity.
   *  `state` is the exact string echoed by the provider — adapters that need
   *  PKCE (X) derive their code_verifier from it instead of storing one. */
  connect(input: {
    code: string;
    redirectUri: string;
    state?: string;
  }): Promise<ConnectResult>;
  /** Server-side token refresh so background jobs never hold stale tokens. */
  refresh(tokens: ConnectionTokens): Promise<ConnectionTokens>;
  publish(input: PublishInput): Promise<PublishResult>;
}
