import { describe, expect, it } from "vitest";

import {
  computeBaseline,
  describeScore,
  isMature,
  MATURITY_HOURS,
  median,
  outlierScore,
  scoreChannel,
  scoreTier,
  TIER_LABELS,
  VALIDATED_MIN_SAMPLE,
  VALIDATED_THRESHOLD,
} from "./outlier";
import type { SourceVideo } from "./types";

const NOW = new Date("2026-08-19T12:00:00Z");

function video(
  overrides: Partial<SourceVideo> & { externalId: string },
): SourceVideo {
  return {
    title: overrides.externalId,
    description: null,
    url: `https://example.com/${overrides.externalId}`,
    thumbnailUrl: null,
    // Old enough to be mature unless a test says otherwise.
    publishedAt: new Date(NOW.getTime() - 30 * 86_400_000).toISOString(),
    durationSeconds: null,
    viewCount: 1000,
    likeCount: null,
    commentCount: null,
    ...overrides,
  };
}

function channel(views: number[]): SourceVideo[] {
  return views.map((v, i) => video({ externalId: `v${i}`, viewCount: v }));
}

describe("median", () => {
  it("takes the middle of an odd list", () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it("averages the middle pair of an even list", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("is null for nothing", () => {
    expect(median([])).toBeNull();
  });
});

describe("computeBaseline", () => {
  it("refuses to guess below the minimum sample", () => {
    const baseline = computeBaseline(channel([100, 200, 300, 400]), NOW);
    expect(baseline.views).toBeNull();
    expect(baseline.sample).toBe(4);
  });

  it("uses the median, so one viral video cannot move it", () => {
    const withoutViral = computeBaseline(channel([100, 100, 100, 100, 100]), NOW);
    const withViral = computeBaseline(
      channel([100, 100, 100, 100, 5_000_000]),
      NOW,
    );
    // A mean would have gone from 100 to a million. The median barely moves.
    expect(withoutViral.views).toBe(100);
    expect(withViral.views).toBe(100);
  });

  it("skips videos with no view count instead of counting them as zero", () => {
    const videos = [
      ...channel([100, 100, 100, 100, 100]),
      video({ externalId: "hidden", viewCount: null }),
    ];
    const baseline = computeBaseline(videos, NOW);
    expect(baseline.views).toBe(100);
    expect(baseline.sample).toBe(5);
  });

  it("excludes videos still accumulating views", () => {
    const fresh = video({
      externalId: "fresh",
      viewCount: 5,
      publishedAt: new Date(NOW.getTime() - 3600_000).toISOString(),
    });
    const baseline = computeBaseline([...channel([100, 100, 100, 100, 100]), fresh], NOW);
    expect(baseline.views).toBe(100);
    expect(baseline.sample).toBe(5);
  });

  it("uses the recent window, not the lifetime", () => {
    // Twenty recent videos at 1000 and a long tail of old 10s: the baseline is
    // the channel's current self.
    const recent = Array.from({ length: 20 }, (_, i) =>
      video({
        externalId: `new${i}`,
        viewCount: 1000,
        publishedAt: new Date(NOW.getTime() - (10 + i) * 86_400_000).toISOString(),
      }),
    );
    const old = Array.from({ length: 30 }, (_, i) =>
      video({
        externalId: `old${i}`,
        viewCount: 10,
        publishedAt: new Date(NOW.getTime() - (500 + i) * 86_400_000).toISOString(),
      }),
    );
    expect(computeBaseline([...old, ...recent], NOW).views).toBe(1000);
  });
});

describe("isMature", () => {
  it("is false inside the maturity window", () => {
    const fresh = video({
      externalId: "fresh",
      publishedAt: new Date(NOW.getTime() - (MATURITY_HOURS - 1) * 3600_000).toISOString(),
    });
    expect(isMature(fresh, NOW)).toBe(false);
  });

  it("assumes maturity when a platform gives no publish date", () => {
    expect(isMature(video({ externalId: "x", publishedAt: null }), NOW)).toBe(true);
  });
});

describe("outlierScore", () => {
  const baseline = { views: 1000, sample: 20 };

  it("is the multiple of the channel's own median", () => {
    expect(outlierScore(video({ externalId: "a", viewCount: 3000 }), baseline, NOW)).toBe(3);
  });

  it("goes below 1 for an underperformer", () => {
    expect(outlierScore(video({ externalId: "a", viewCount: 250 }), baseline, NOW)).toBe(0.25);
  });

  it("is null without a baseline, rather than a confident wrong number", () => {
    expect(
      outlierScore(video({ externalId: "a" }), { views: null, sample: 2 }, NOW),
    ).toBeNull();
  });

  it("is null for a zero baseline rather than dividing by it", () => {
    expect(
      outlierScore(video({ externalId: "a" }), { views: 0, sample: 20 }, NOW),
    ).toBeNull();
  });

  it("is null for a video too young to judge", () => {
    const fresh = video({
      externalId: "fresh",
      viewCount: 10_000,
      publishedAt: new Date(NOW.getTime() - 3600_000).toISOString(),
    });
    expect(outlierScore(fresh, baseline, NOW)).toBeNull();
  });
});

describe("scoreChannel", () => {
  it("ranks a small channel's breakout above a big channel's ordinary day", () => {
    // The whole product insight, as a test. Small channel: 3k normal, one 30k.
    // Big channel: 2M normal, one 2.2M.
    const small = scoreChannel(
      [...channel([3000, 3000, 3000, 3000, 3000]), video({ externalId: "hit", viewCount: 30_000 })],
      NOW,
    );
    const big = scoreChannel(
      [
        ...channel([2_000_000, 2_000_000, 2_000_000, 2_000_000, 2_000_000]),
        video({ externalId: "ok", viewCount: 2_200_000 }),
      ],
      NOW,
    );

    const smallHit = small.scored.find((s) => s.video.externalId === "hit");
    const bigOk = big.scored.find((s) => s.video.externalId === "ok");

    expect(smallHit?.score).toBe(10);
    expect(bigOk?.score).toBe(1.1);
    // 30k beats 2.2M on the only measure that matters.
    expect((smallHit?.score ?? 0) > (bigOk?.score ?? 0)).toBe(true);
  });

  it("records the baseline each score was computed against", () => {
    const { scored } = scoreChannel(channel([100, 100, 100, 100, 100]), NOW);
    expect(scored.every((s) => s.baselineViews === 100)).toBe(true);
  });
});

describe("describeScore", () => {
  it("says so rather than showing a bare number when there is no data", () => {
    expect(describeScore(null)).toBe("Not enough data yet");
  });

  it("calls out a big multiple, but not as validated without a sample", () => {
    // No sample given, so 12x is an outlier — the validated bar needs a
    // baseline thick enough to stand behind.
    expect(describeScore(12)).toContain("outlier");
  });

  it("does not flatter an underperformer", () => {
    expect(describeScore(0.4)).toContain("below");
  });
});

describe("scoreTier", () => {
  it("calls a big multiple validated only when the baseline is thick enough", () => {
    // The word is meant literally: not merely a big number, but a big number
    // we can stand behind. 40x off three videos is noise wearing a big number.
    expect(scoreTier(40, 3)).toBe("outlier");
    expect(scoreTier(40, VALIDATED_MIN_SAMPLE)).toBe("validated");
  });

  it("separates 'did well' from 'worth reverse-engineering'", () => {
    expect(scoreTier(2.5, 20)).toBe("strong");
    expect(scoreTier(6, 20)).toBe("outlier");
    expect(scoreTier(VALIDATED_THRESHOLD, 20)).toBe("validated");
  });

  it("does not flatter an underperformer", () => {
    expect(scoreTier(0.4, 20)).toBe("under");
    expect(scoreTier(1.2, 20)).toBe("normal");
  });

  it("is unknown without a score, whatever the sample", () => {
    expect(scoreTier(null, 50)).toBe("unknown");
  });

  it("has a label for every tier, so the UI never shows a bare enum", () => {
    for (const score of [null, 0.5, 1.5, 3, 7, 20]) {
      const tier = scoreTier(score, 20);
      expect(TIER_LABELS[tier].length).toBeGreaterThan(0);
    }
  });
});

describe("describeScore with a sample", () => {
  it("says validated outlier when it has earned it", () => {
    expect(describeScore(12, 20)).toContain("validated outlier");
  });

  it("stops short of validated on a thin baseline", () => {
    expect(describeScore(12, 4)).toContain("outlier");
    expect(describeScore(12, 4)).not.toContain("validated");
  });
});
