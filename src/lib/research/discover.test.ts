import { describe, expect, it } from "vitest";

import {
  matchesSizeTiers,
  parseChannelSuggestions,
  parsePastedChannels,
} from "./discover";

describe("matchesSizeTiers", () => {
  it("keeps everything when no tier is chosen", () => {
    expect(matchesSizeTiers(42, [])).toBe(true);
  });

  it("matches within a tier and not outside it", () => {
    expect(matchesSizeTiers(80_000, ["small"])).toBe(true);
    expect(matchesSizeTiers(9_000, ["small"])).toBe(false);
  });

  it("keeps a channel whose follower count is unknown", () => {
    // Dropping a real channel over a missing number is the worse mistake.
    expect(matchesSizeTiers(null, ["mega"])).toBe(true);
  });

  it("accepts any of several tiers", () => {
    expect(matchesSizeTiers(300_000, ["small", "medium"])).toBe(true);
  });
});

describe("parseChannelSuggestions", () => {
  it("reads grouped handles", () => {
    const groups = parseChannelSuggestions(
      ["## MARKETING", "@one", "@two", "## DESIGN", "- @three"].join("\n"),
    );
    expect(groups).toEqual([
      { group: "MARKETING", handles: ["one", "two"] },
      { group: "DESIGN", handles: ["three"] },
    ]);
  });

  it("still works when the model skipped the headings", () => {
    const groups = parseChannelSuggestions("@alpha\n@beta");
    expect(groups).toEqual([{ group: "Suggested", handles: ["alpha", "beta"] }]);
  });

  it("drops prose that is not a handle", () => {
    const groups = parseChannelSuggestions(
      "## X\n@real\nHere are some great accounts for you!",
    );
    expect(groups[0].handles).toEqual(["real"]);
  });

  it("returns nothing for an answer with no handles at all", () => {
    expect(parseChannelSuggestions("I could not find any accounts.")).toEqual([]);
  });
});

describe("parsePastedChannels", () => {
  it("splits on newlines and commas and deduplicates", () => {
    expect(
      parsePastedChannels("a.com/x\n b.com/y ,a.com/X\n\n c.com/z"),
    ).toEqual(["a.com/x", "b.com/y", "c.com/z"]);
  });

  it("caps the batch", () => {
    const many = Array.from({ length: 80 }, (_, i) => `channel${i}`).join("\n");
    expect(parsePastedChannels(many)).toHaveLength(50);
  });
});
