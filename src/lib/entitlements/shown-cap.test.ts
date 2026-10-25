import { describe, expect, it } from "vitest";
import { shownCap, UNREACHABLE_CAP } from "./types";

describe("shownCap", () => {
  it("shows a real cap as itself", () => {
    expect(shownCap(300)).toBe(300);
    expect(shownCap(0)).toBe(0);
    expect(shownCap(UNREACHABLE_CAP - 1)).toBe(UNREACHABLE_CAP - 1);
  });

  it("shows an unreachable cap as no cap", () => {
    expect(shownCap(UNREACHABLE_CAP)).toBeNull();
    expect(shownCap(UNREACHABLE_CAP * 2)).toBeNull();
  });
});
