// The one idea the whole research pillar rests on.
//
// A raw view count is nearly meaningless across channels: 2M views on a
// 5M-subscriber channel is a quiet Tuesday, while 40k views on a 3k-subscriber
// channel is the best thing that ever happened to it. So every video is scored
// against ITS OWN channel's recent baseline, and the feed ranks by that
// multiple. That is the whole product insight — everything else is plumbing.
//
// Pure functions over plain numbers: no database, no network, no clock beyond
// what the caller passes in. That is what makes the ranking testable.

import type { SourceVideo } from "./types";

/** How many recent videos form the baseline. Big enough that one viral video
 *  cannot drag the median, small enough that a channel that changed format six
 *  months ago is not judged against its old self. */
export const BASELINE_WINDOW = 20;

/** Below this many videos a channel has no meaningful baseline and every score
 *  is null — an honest "not enough data yet" beats a confident wrong number. */
export const MIN_BASELINE_SAMPLE = 5;

/** A video younger than this is still accumulating views, so scoring it against
 *  finished videos flatters the old ones and buries the new. Excluded from the
 *  baseline AND left unscored until it matures. */
export const MATURITY_HOURS = 48;

/** At or above this multiple a video is worth the user's attention. Used for
 *  the feed's default filter and the "outlier" badge. */
export const OUTLIER_THRESHOLD = 2;

/** Median, not mean: one 50x video would otherwise raise the baseline enough to
 *  hide every other outlier on the channel. */
export function median(values: readonly number[]): number | null {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function ageHours(publishedAt: string | null, now: Date): number | null {
  if (!publishedAt) return null;
  const ms = Date.parse(publishedAt);
  if (Number.isNaN(ms)) return null;
  return (now.getTime() - ms) / 3_600_000;
}

/** True when a video is old enough for its view count to mean something. */
export function isMature(video: SourceVideo, now: Date): boolean {
  const hours = ageHours(video.publishedAt, now);
  // No publish date: assume mature. Better to score it than to hide it forever.
  if (hours === null) return true;
  return hours >= MATURITY_HOURS;
}

export interface Baseline {
  /** Null when the channel has too few mature videos to judge against. */
  views: number | null;
  /** How many videos went into it — surfaced in the UI so a weak baseline is
   *  visible rather than implied. */
  sample: number;
}

/**
 * The channel's typical view count: the median of its most recent mature
 * videos. Videos without a view count (Instagram hides them on some media) are
 * skipped rather than counted as zero, which would halve every baseline.
 */
export function computeBaseline(
  videos: readonly SourceVideo[],
  now: Date,
  window: number = BASELINE_WINDOW,
): Baseline {
  const counts = videos
    .filter((v) => isMature(v, now))
    .filter((v): v is SourceVideo & { viewCount: number } =>
      typeof v.viewCount === "number" && Number.isFinite(v.viewCount),
    )
    // Newest first, then take the window: a channel's baseline is its RECENT
    // self, not its lifetime average.
    .sort((a, b) => publishedMs(b) - publishedMs(a))
    .slice(0, window)
    .map((v) => v.viewCount);

  if (counts.length < MIN_BASELINE_SAMPLE) {
    return { views: null, sample: counts.length };
  }
  return { views: median(counts), sample: counts.length };
}

function publishedMs(v: SourceVideo): number {
  if (!v.publishedAt) return 0;
  const ms = Date.parse(v.publishedAt);
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * How many times its own channel's normal a video did. 1 = average for this
 * channel, 3 = tripled it. Null whenever the answer would be a guess: no
 * baseline, no view count, a zero baseline (division), or a video still too
 * young to have finished accumulating views.
 */
export function outlierScore(
  video: SourceVideo,
  baseline: Baseline,
  now: Date,
): number | null {
  if (baseline.views === null || baseline.views <= 0) return null;
  if (typeof video.viewCount !== "number" || !Number.isFinite(video.viewCount)) {
    return null;
  }
  if (!isMature(video, now)) return null;
  return round3(video.viewCount / baseline.views);
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export interface ScoredVideo {
  video: SourceVideo;
  score: number | null;
  baselineViews: number | null;
}

/** Score a whole channel in one pass, newest-first order preserved. */
export function scoreChannel(
  videos: readonly SourceVideo[],
  now: Date,
): { baseline: Baseline; scored: ScoredVideo[] } {
  const baseline = computeBaseline(videos, now);
  return {
    baseline,
    scored: videos.map((video) => ({
      video,
      score: outlierScore(video, baseline, now),
      baselineViews: baseline.views,
    })),
  };
}

/** Plain-English label for a score, so the UI never shows a bare float. */
export function describeScore(score: number | null): string {
  if (score === null) return "Not enough data yet";
  if (score >= 10) return `${trim(score)}x — massive outlier`;
  if (score >= OUTLIER_THRESHOLD) return `${trim(score)}x its channel average`;
  if (score >= 1) return `${trim(score)}x — around average`;
  return `${trim(score)}x — below this channel's average`;
}

function trim(n: number): string {
  return n >= 10 ? String(Math.round(n)) : n.toFixed(1);
}
