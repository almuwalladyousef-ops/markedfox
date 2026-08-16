import { describe, expect, it } from "vitest";

import {
  IMAGE_POLL_TOTAL_MS,
  pollDelays,
  pollTotalMs,
  VIDEO_POLL_TOTAL_MS,
} from "./polling";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("pollTotalMs", () => {
  it("gives video far longer than images", () => {
    expect(pollTotalMs(false)).toBe(IMAGE_POLL_TOTAL_MS);
    expect(pollTotalMs(true)).toBe(VIDEO_POLL_TOTAL_MS);
    expect(VIDEO_POLL_TOTAL_MS).toBeGreaterThan(IMAGE_POLL_TOTAL_MS);
  });

  it("waits well past the 32s a real video container took", () => {
    // The measurement that prompted this: 60s failed, 32s succeeded on retry.
    expect(VIDEO_POLL_TOTAL_MS).toBeGreaterThan(4 * 32_000);
  });
});

describe("pollDelays", () => {
  it("never sleeps longer in total than it was given", () => {
    for (const total of [1000, 60_000, 90_000, 300_000]) {
      expect(sum(pollDelays(total))).toBeLessThanOrEqual(total);
    }
  });

  it("checks quickly at first, then backs off to the cap", () => {
    const delays = pollDelays(300_000);
    expect(delays[0]).toBe(2000);
    // Non-decreasing until the final entry, which may be trimmed to fit.
    for (let i = 1; i < delays.length - 1; i++) {
      expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1]);
    }
    expect(Math.max(...delays)).toBeLessThanOrEqual(15_000);
    expect(delays.at(-1)).toBeLessThanOrEqual(15_000);
  });

  it("spends far fewer calls than a flat 3s poll, which matters per app", () => {
    // The old behaviour over five minutes would have been 100 calls.
    const delays = pollDelays(VIDEO_POLL_TOTAL_MS);
    expect(delays.length).toBeLessThan(40);
    // Still enough checks that a fast container is not left waiting.
    expect(delays.length).toBeGreaterThan(15);
  });

  it("reaches a real container's 32s within the first few checks", () => {
    const delays = pollDelays(VIDEO_POLL_TOTAL_MS);
    let elapsed = 0;
    let checks = 0;
    for (const d of delays) {
      elapsed += d;
      checks++;
      if (elapsed >= 32_000) break;
    }
    expect(checks).toBeLessThanOrEqual(6);
  });

  it("handles a total smaller than one delay", () => {
    expect(pollDelays(500)).toEqual([500]);
    expect(sum(pollDelays(500))).toBe(500);
  });

  it("returns nothing for a non-positive budget", () => {
    expect(pollDelays(0)).toEqual([]);
    expect(pollDelays(-5)).toEqual([]);
  });

  it("respects overridden pacing", () => {
    const delays = pollDelays(10_000, { initialMs: 1000, factor: 2, maxMs: 4000 });
    expect(delays[0]).toBe(1000);
    expect(Math.max(...delays)).toBeLessThanOrEqual(4000);
    expect(sum(delays)).toBeLessThanOrEqual(10_000);
  });
});
