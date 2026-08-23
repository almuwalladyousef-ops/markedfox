import { describe, expect, it } from "vitest";

import { move, order, parsePreferences } from "./preferences";
import { PLATFORMS } from "@/lib/platforms/types";

// A stored preference is written against whatever version of the product the
// person was using at the time, so both of these are normal rather than
// exceptional: a list naming something that has since been removed, and a list
// missing something that has since been added.
describe("order", () => {
  it("keeps the stored order", () => {
    expect(order(["c", "a", "b"], ["a", "b", "c"])).toEqual(["c", "a", "b"]);
  });

  it("drops entries that no longer exist", () => {
    expect(order(["a", "gone", "b"], ["a", "b"])).toEqual(["a", "b"]);
  });

  it("appends entries the stored list never knew about", () => {
    // The case that matters: a platform added after somebody last touched this
    // screen must still appear, or it is invisible to every existing user.
    expect(order(["b"], ["a", "b", "c"])).toEqual(["b", "a", "c"]);
  });

  it("ignores duplicates and non-strings", () => {
    expect(order(["a", "a", 7, null], ["a", "b"])).toEqual(["a", "b"]);
  });

  it("falls back to the canonical order for anything that is not a list", () => {
    expect(order(undefined, ["a", "b"])).toEqual(["a", "b"]);
    expect(order("a,b", ["a", "b"])).toEqual(["a", "b"]);
  });
});

describe("parsePreferences", () => {
  it("returns every platform even from an empty blob", () => {
    expect(parsePreferences({}).platformOrder).toEqual([...PLATFORMS]);
  });

  it("survives a null column", () => {
    expect(parsePreferences(null).postTypeOrder).toEqual(["video", "photo", "text"]);
  });
});

describe("move", () => {
  it("moves an item one place", () => {
    expect(move(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(move(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
  });

  it("is a no-op at the ends, so the buttons need no special case", () => {
    expect(move(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(move(["a", "b"], 1, 1)).toEqual(["a", "b"]);
  });
});
