import { describe, expect, it } from "vitest";

import { EMPTY_BREAKDOWN } from "./breakdown";
import { exportAnalysis } from "./export";

const base = {
  title: "Why nobody watched your video",
  url: "https://example.test/v/1",
  channel: "Someone",
  platform: "youtube",
  score: 3.25,
  baselineViews: 40_000,
  views: 130_000,
  breakdown: null,
  transcript: null,
};

describe("exportAnalysis", () => {
  it("leads with the title and the facts", () => {
    const out = exportAnalysis(base);
    expect(out).toContain("# Why nobody watched your video");
    expect(out).toContain("- URL: https://example.test/v/1");
    expect(out).toContain("3.3x this channel's own recent median");
    expect(out).toContain("(normally 40,000)");
  });

  it("omits sections a breakdown could not fill", () => {
    const out = exportAnalysis({
      ...base,
      breakdown: { ...EMPTY_BREAKDOWN, hook: "Most people never..." },
    });
    expect(out).toContain("## The hook");
    // No idea fields were filled, so no idea heading — an empty heading reads
    // as "the video had no idea".
    expect(out).not.toContain("## The idea");
    expect(out).not.toContain("## Structure");
  });

  it("includes the transcript last when there is one", () => {
    const out = exportAnalysis({ ...base, transcript: "hello there" });
    expect(out.indexOf("## Transcript")).toBeGreaterThan(out.indexOf("# Why"));
    expect(out.endsWith("hello there")).toBe(true);
  });

  it("says nothing about performance when there is no score", () => {
    const out = exportAnalysis({ ...base, score: null });
    expect(out).not.toContain("Performance:");
  });
});
