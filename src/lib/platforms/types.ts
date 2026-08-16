// Every platform the product will ever gate by plan. Must stay in lockstep
// with the `platform` enum in the initial schema migration.
export const PLATFORMS = [
  "instagram",
  "x",
  "threads",
  "facebook",
  "tiktok",
  "youtube",
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
  /** OAuth leg 1: the URL the user is sent to. */
  getAuthorizeUrl(input: { redirectUri: string; state: string }): string;
  /** OAuth leg 2: exchange the callback code for tokens + account identity. */
  connect(input: { code: string; redirectUri: string }): Promise<ConnectResult>;
  /** Server-side token refresh so background jobs never hold stale tokens. */
  refresh(tokens: ConnectionTokens): Promise<ConnectionTokens>;
  publish(input: PublishInput): Promise<PublishResult>;
}
