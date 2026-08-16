// How long to wait between container status checks, and for how long overall.
//
// Instagram and Threads both publish media in two steps: create a container,
// then publish it once the platform has finished processing. Processing is
// asynchronous and the wait is wildly uneven — an image is usually ready
// immediately, while a video has to be fetched from our storage and
// transcoded.
//
// Measured on 2026-08-16 against the live API with a 0.5MB .mov: the first
// attempt did not finish inside 60s and failed the post; an identical
// container a few minutes later finished in 32s. So the old flat
// 20 × 3s = 60s ceiling sat right on top of the typical case, which is a coin
// flip rather than a limit. Meta's own guidance for Reels is to poll for
// minutes.
//
// Backing off matters as much as the ceiling: Meta rate-limits per app, not
// per user (CLAUDE.md), so every customer's polling shares one budget. A flat
// 3s poll for five minutes is 100 calls for a single video post; this
// schedule spends 30.

export const IMAGE_POLL_TOTAL_MS = 90_000;
export const VIDEO_POLL_TOTAL_MS = 300_000;

export function pollTotalMs(hasVideo: boolean): number {
  return hasVideo ? VIDEO_POLL_TOTAL_MS : IMAGE_POLL_TOTAL_MS;
}

// The sequence of sleeps to use, shortest first: quick early checks so a fast
// container is not held up, then longer gaps so a slow one is cheap to wait
// for. The sum never exceeds totalMs.
export function pollDelays(
  totalMs: number,
  options: { initialMs?: number; factor?: number; maxMs?: number } = {},
): number[] {
  const initial = options.initialMs ?? 2000;
  const factor = options.factor ?? 1.5;
  const max = options.maxMs ?? 15_000;

  const delays: number[] = [];
  let spent = 0;
  let delay = initial;

  while (spent < totalMs) {
    const next = Math.min(Math.round(delay), max, totalMs - spent);
    if (next <= 0) break;
    delays.push(next);
    spent += next;
    delay = Math.min(delay * factor, max);
  }

  return delays;
}
