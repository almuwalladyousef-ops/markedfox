import { describe, expect, it } from "vitest";

import { FEED_DEFAULTS, parseFeedQuery } from "./feed-query";
import { savedFilterParams } from "./studio-types";

describe("parseFeedQuery", () => {
  it("returns no constraints for an empty query", () => {
    const { filters, active, form } = parseFeedQuery({});
    // sort and limit are always set; nothing else should be.
    expect(Object.keys(filters).sort()).toEqual(["limit", "sort"]);
    expect(active).toBe(false);
    expect(form.minScore).toBe(FEED_DEFAULTS.minScore);
    expect(form.analyzed && form.unanalyzed).toBe(true);
  });

  it("does not filter when a range is left at its default", () => {
    const { filters } = parseFeedQuery({
      min_score: "0",
      max_views: "10000000",
    });
    expect(filters.minScore).toBeUndefined();
    expect(filters.maxViews).toBeUndefined();
  });

  it("converts engagement percentages to fractions", () => {
    const { filters } = parseFeedQuery({ min_eng: "2" });
    expect(filters.minEngagement).toBeCloseTo(0.02);
  });

  it("converts months to days", () => {
    const { filters } = parseFeedQuery({ posted: "6", posted_unit: "months" });
    expect(filters.postedWithinDays).toBe(180);
  });

  it("treats both status boxes as no status filter", () => {
    expect(
      parseFeedQuery({ status: ["analyzed", "unanalyzed"] }).filters.analyzed,
    ).toBeUndefined();
    expect(parseFeedQuery({ status: "analyzed" }).filters.analyzed).toBe(true);
    expect(parseFeedQuery({ status: "unanalyzed" }).filters.analyzed).toBe(false);
  });

  it("ignores a sort it does not know", () => {
    expect(parseFeedQuery({ sort: "chaos" }).form.sort).toBe("outlier");
  });

  it("keeps several channels", () => {
    const { filters } = parseFeedQuery({ source: ["a", "b"] });
    expect(filters.sourceIds).toEqual(["a", "b"]);
  });
});

describe("savedFilterParams", () => {
  it("keeps every channel a saved filter had", () => {
    // The bug this pins: a filter saved with six channels reloaded with one.
    const params = savedFilterParams({ source: ["a", "b", "c"], sort: "views" });
    expect(params.getAll("source")).toEqual(["a", "b", "c"]);
    expect(params.get("sort")).toBe("views");
  });

  it("reads a row written before multi-values were stored", () => {
    expect(savedFilterParams({ q: "hooks" }).get("q")).toBe("hooks");
  });

  it("round-trips through the parser without changing meaning", () => {
    const saved = { source: ["a", "b"], status: ["analyzed", "unanalyzed"] };
    const parsed = parseFeedQuery(
      Object.fromEntries(
        [...savedFilterParams(saved).keys()].map((key) => [
          key,
          savedFilterParams(saved).getAll(key),
        ]),
      ),
    );
    expect(parsed.filters.sourceIds).toEqual(["a", "b"]);
    // Both boxes ticked is the same set as neither, so no status filter.
    expect(parsed.filters.analyzed).toBeUndefined();
  });

  it("drops empty values rather than emitting blank params", () => {
    expect([...savedFilterParams({ q: [""], sort: "" }).keys()]).toEqual([]);
  });
});
