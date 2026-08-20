// Syncing a source: read the channel, score every video against the channel's
// own baseline, write both back.
//
// Pure orchestration over an injected store, the same pattern as publishPost
// and the DM engine — so the interesting logic (what gets scored, what happens
// when a provider fails, which videos are new) is testable without Postgres or
// a network.

import { scoreChannel } from "./outlier";
import { getResearchProvider } from "./providers";
import {
  ResearchProviderError,
  type ProviderContext,
  type ResearchPlatform,
  type SourceVideo,
} from "./types";

/** How many recent videos a sync pulls. Comfortably above BASELINE_WINDOW so
 *  the median is computed from a full window even after a few unscoreable
 *  videos are dropped. */
export const SYNC_VIDEO_LIMIT = 50;

export interface StoredSource {
  id: string;
  userId: string;
  workspaceId: string;
  platform: ResearchPlatform;
  externalId: string;
  handle: string | null;
  title: string;
  connectionId: string | null;
}

export interface VideoUpsert {
  sourceId: string;
  userId: string;
  workspaceId: string;
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
  outlierScore: number | null;
  baselineViews: number | null;
}

export interface SyncStore {
  /** Decrypted, refreshed token for the source's connection. Providers that
   *  need no connection never cause this to be called. */
  contextFor(source: StoredSource): Promise<ProviderContext>;
  upsertVideos(rows: VideoUpsert[]): Promise<void>;
  updateSourceBaseline(input: {
    sourceId: string;
    baselineViews: number | null;
    baselineSample: number;
    syncedAt: string;
  }): Promise<void>;
  recordSourceError(sourceId: string, message: string): Promise<void>;
}

export interface SyncResult {
  sourceId: string;
  ok: boolean;
  videos: number;
  baselineViews: number | null;
  baselineSample: number;
  /** Videos at or above the outlier threshold, for the "3 new outliers" line. */
  outliers: number;
  error?: string;
}

export interface SyncOptions {
  now?: Date;
  limit?: number;
  /** Injectable so tests never touch the real providers. */
  listVideos?: (
    source: StoredSource,
    ctx: ProviderContext,
    limit: number,
  ) => Promise<SourceVideo[]>;
}

export async function syncSource(
  source: StoredSource,
  store: SyncStore,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? SYNC_VIDEO_LIMIT;

  try {
    const provider = getResearchProvider(source.platform);
    const ctx = provider.capabilities.requiresConnection
      ? await store.contextFor(source)
      : {};

    const fetchVideos =
      options.listVideos ??
      ((s: StoredSource, c: ProviderContext, n: number) =>
        provider.listVideos(
          {
            platform: s.platform,
            externalId: s.externalId,
            handle: s.handle,
            title: s.title,
            thumbnailUrl: null,
            followerCount: null,
          },
          c,
          n,
        ));

    const videos = await fetchVideos(source, ctx, limit);
    const { baseline, scored } = scoreChannel(videos, now);

    if (scored.length > 0) {
      await store.upsertVideos(
        scored.map(({ video, score, baselineViews }) => ({
          sourceId: source.id,
          userId: source.userId,
          workspaceId: source.workspaceId,
          externalId: video.externalId,
          title: video.title,
          description: video.description,
          url: video.url,
          thumbnailUrl: video.thumbnailUrl,
          publishedAt: video.publishedAt,
          durationSeconds: video.durationSeconds,
          viewCount: video.viewCount,
          likeCount: video.likeCount,
          commentCount: video.commentCount,
          outlierScore: score,
          baselineViews,
        })),
      );
    }

    await store.updateSourceBaseline({
      sourceId: source.id,
      baselineViews: baseline.views,
      baselineSample: baseline.sample,
      syncedAt: now.toISOString(),
    });

    return {
      sourceId: source.id,
      ok: true,
      videos: scored.length,
      baselineViews: baseline.views,
      baselineSample: baseline.sample,
      outliers: scored.filter((s) => (s.score ?? 0) >= 2).length,
    };
  } catch (error) {
    // A source that fails records why and stays in the list. Deleting it, or
    // failing the whole sweep, would lose the user's watchlist to one bad day
    // at a platform.
    const message =
      error instanceof ResearchProviderError
        ? error.message
        : `Sync failed: ${(error as Error).message}`;
    await store.recordSourceError(source.id, message);
    return {
      sourceId: source.id,
      ok: false,
      videos: 0,
      baselineViews: null,
      baselineSample: 0,
      outliers: 0,
      error: message,
    };
  }
}

/** Sweep several sources one after another. Sequential on purpose: the box is
 *  1 vCPU and the platforms rate-limit per app, so parallel syncs would spend
 *  a shared budget faster without finishing sooner. */
export async function syncSources(
  sources: readonly StoredSource[],
  store: SyncStore,
  options: SyncOptions = {},
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  for (const source of sources) {
    results.push(await syncSource(source, store, options));
  }
  return results;
}
