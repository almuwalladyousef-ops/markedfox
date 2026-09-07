import { describe, expect, it } from "vitest";

import { parseIso8601Duration } from "./youtube";
import { isLongVideo, SHORT_VIDEO_MAX_SECONDS } from "./types";

// The short/long tabs stand entirely on these two functions: one turns
// YouTube's string into seconds, the other decides which side of the line a
// number falls. Everything else is a database filter.

describe("parseIso8601Duration", () => {
  it("reads the shapes YouTube actually sends", () => {
    expect(parseIso8601Duration("PT45S")).toBe(45);
    expect(parseIso8601Duration("PT4M13S")).toBe(253);
    expect(parseIso8601Duration("PT1H")).toBe(3600);
    expect(parseIso8601Duration("PT1H2M3S")).toBe(3723);
    expect(parseIso8601Duration("PT2M")).toBe(120);
  });

  it("handles days, which ISO allows and a long stream produces", () => {
    expect(parseIso8601Duration("P1DT2H")).toBe(93600);
  });

  it("rounds fractional seconds rather than storing a fraction", () => {
    expect(parseIso8601Duration("PT1M30.5S")).toBe(91);
  });

  // Every one of these must be null and never 0. Zero sorts as short, so a
  // value we failed to read would file a 40-minute upload under Shorts —
  // which is the exact mistake the duration column exists to prevent.
  it("returns null, never zero, for anything it cannot read", () => {
    expect(parseIso8601Duration(undefined)).toBeNull();
    expect(parseIso8601Duration("")).toBeNull();
    expect(parseIso8601Duration("P0D")).toBeNull();
    expect(parseIso8601Duration("PT")).toBeNull();
    expect(parseIso8601Duration("4:13")).toBeNull();
    expect(parseIso8601Duration("253")).toBeNull();
    expect(parseIso8601Duration("garbage")).toBeNull();
  });
});

describe("isLongVideo", () => {
  it("puts the boundary itself on the short side", () => {
    expect(isLongVideo(SHORT_VIDEO_MAX_SECONDS)).toBe(false);
    expect(isLongVideo(SHORT_VIDEO_MAX_SECONDS + 1)).toBe(true);
  });

  it("treats a three-minute Short as short and a four-minute video as long", () => {
    expect(isLongVideo(179)).toBe(false);
    expect(isLongVideo(240)).toBe(true);
  });

  // An unknown length is not long. It is also not short — the query drops it
  // from both tabs, because Postgres comparisons against NULL are never true.
  // This is the half of that rule the app can assert.
  it("never calls an unknown length long", () => {
    expect(isLongVideo(null)).toBe(false);
    expect(isLongVideo(undefined)).toBe(false);
  });
});
