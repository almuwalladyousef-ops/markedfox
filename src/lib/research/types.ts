// Pillar 3: research and scripting.
//
// The domain in one sentence: watch channels, notice which of their videos beat
// THAT channel's own recent baseline, and turn the winners into hooks and
// scripts. Everything here is platform-neutral; a provider (lib/research/
// providers/) knows how to read one platform and returns these shapes.

/** The platforms whose content we can actually read. Deliberately smaller than
 *  Platform: Snapchat has no public content API at all, so it is absent rather
 *  than present-and-broken. Mirrors the research_platform enum. */
export type ResearchPlatform = "youtube" | "instagram" | "x" | "tiktok";

export const RESEARCH_PLATFORMS: readonly ResearchPlatform[] = [
  "youtube",
  "instagram",
  "x",
  "tiktok",
] as const;

/** What a provider can do, so the UI never offers an impossible action. */
export interface ResearchCapabilities {
  /** Can look up any public channel by handle or URL — YouTube only today. */
  readonly discoverAnyChannel: boolean;
  /** Reads through a connected account's token rather than an API key. */
  readonly requiresConnection: boolean;
  /** Reads only the connected user's OWN content. True for TikTok, whose
   *  Research API is academic-only, so competitors are unreadable. */
  readonly ownContentOnly: boolean;
  /** Costs real money per read (X). The UI warns before syncing. */
  readonly meteredReads: boolean;
  /** Can fetch a transcript for a video. */
  readonly transcripts: boolean;
}

/** A channel or account being watched. */
export interface SourceIdentity {
  platform: ResearchPlatform;
  externalId: string;
  handle: string | null;
  title: string;
  thumbnailUrl: string | null;
  followerCount: number | null;
}

/** One piece of content, as a provider reports it. Counts may be null when a
 *  platform hides them (Instagram hides view counts on some media types). */
export interface SourceVideo {
  externalId: string;
  title: string;
  description: string | null;
  url: string;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  durationSeconds: number | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
}

export interface TranscriptResult {
  /** Empty string when origin is 'unavailable'. */
  text: string;
  language: string | null;
  origin: "captions" | "unavailable";
}

/** A provider reads one platform. Adding a platform is one file in
 *  lib/research/providers/, exactly like lib/platforms/. */
export interface ResearchProvider {
  readonly platform: ResearchPlatform;
  readonly label: string;
  readonly capabilities: ResearchCapabilities;
  /** Env this provider needs to work at all. Empty means it works through a
   *  connection instead. The UI shows "Coming soon" when any is missing. */
  readonly requiredEnv: readonly string[];

  /** Turn what the user typed (a handle, a URL, an id) into a real channel. */
  resolveSource(input: string, ctx: ProviderContext): Promise<SourceIdentity>;

  /** The channel's recent uploads, newest first, at most `limit`. */
  listVideos(
    source: SourceIdentity,
    ctx: ProviderContext,
    limit: number,
  ): Promise<SourceVideo[]>;

  /** Only called when capabilities.transcripts is true. */
  fetchTranscript?(video: {
    externalId: string;
    url: string;
  }): Promise<TranscriptResult>;
}

/** What a provider gets handed at call time. Access tokens arrive already
 *  decrypted and refreshed by the caller — a provider never touches storage. */
export interface ProviderContext {
  accessToken?: string;
  /** The connected account's own platform id, for providers that read through
   *  their own account (Instagram business discovery needs it in the path). */
  platformAccountId?: string;
}

export class ResearchProviderError extends Error {
  constructor(
    message: string,
    readonly code:
      | "not_found"
      | "not_supported"
      | "needs_connection"
      | "rate_limited"
      | "upstream"
      | "not_configured",
  ) {
    super(message);
    this.name = "ResearchProviderError";
  }
}
