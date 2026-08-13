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

export interface ConnectResult {
  tokens: ConnectionTokens;
  account: {
    platformAccountId: string;
    platformAccountName?: string;
  };
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

// One adapter per platform, one file per adapter, registered in registry.ts.
// Routes never contain platform-specific code: they resolve an adapter and
// call it. A per-platform `validate()` (caption limits, aspect ratios, media
// rules surfaced before publish) joins this interface in Phase 3.
export interface PlatformAdapter {
  readonly id: Platform;
  readonly displayName: string;
  readonly capabilities: PlatformCapabilities;
  /** OAuth leg 1: the URL the user is sent to. */
  getAuthorizeUrl(input: { redirectUri: string; state: string }): string;
  /** OAuth leg 2: exchange the callback code for tokens + account identity. */
  connect(input: { code: string; redirectUri: string }): Promise<ConnectResult>;
  /** Server-side token refresh so background jobs never hold stale tokens. */
  refresh(tokens: ConnectionTokens): Promise<ConnectionTokens>;
  publish(input: PublishInput): Promise<PublishResult>;
}
