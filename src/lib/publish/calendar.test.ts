import { describe, expect, it } from "vitest";

import {
  addMonths,
  fromDateParam,
  parseView,
  rangeFor,
  rangeLabel,
  shift,
  startOfWeek,
  toDateParam,
} from "./calendar";

// Local time throughout, which is the point: somebody scheduling "Tuesday 9am"
// means 9am where they are.
const wed = new Date(2026, 7, 19, 14, 30); // Wed 19 Aug 2026

describe("parseView", () => {
  it("defaults to the week", () => {
    expect(parseView(undefined)).toBe("month");
    expect(parseView("nonsense")).toBe("month");
    expect(parseView("month")).toBe("month");
  });
});

describe("rangeFor", () => {
  it("gives one day for the day view", () => {
    const { days, start } = rangeFor("day", wed);
    expect(days).toHaveLength(1);
    expect(start.getHours()).toBe(0);
  });

  it("starts the week on Sunday", () => {
    const { days } = rangeFor("week", wed);
    expect(days).toHaveLength(7);
    expect(days[0].getDay()).toBe(0);
    expect(days[0].getDate()).toBe(16);
  });

  it("draws whole weeks in the month view", () => {
    const { days } = rangeFor("month", wed);
    // A grid that changes height as you page through the year is worse than a
    // few greyed-out days.
    expect(days.length % 7).toBe(0);
    expect(days[0].getDay()).toBe(0);
    expect(days[0].getMonth()).toBe(6); // spills back into July
  });

  it("covers every day of the month it was asked for", () => {
    const { days } = rangeFor("month", new Date(2026, 1, 10)); // February
    const inFebruary = days.filter((d) => d.getMonth() === 1);
    expect(inFebruary).toHaveLength(28);
  });
});

describe("addMonths", () => {
  it("does not skip a month from the 31st", () => {
    // Naively adding a month to 31 January lands on 3 March.
    expect(addMonths(new Date(2026, 0, 31), 1).getMonth()).toBe(1);
  });
});

describe("shift", () => {
  it("moves by the size of the view", () => {
    expect(shift("day", wed, 1).getDate()).toBe(20);
    expect(shift("week", wed, -1).getDate()).toBe(12);
    expect(shift("month", wed, 1).getMonth()).toBe(8);
  });
});

describe("rangeLabel", () => {
  it("keeps a week inside one month on one line", () => {
    expect(rangeLabel("week", wed)).toContain("16–22");
  });

  it("names both months when a week straddles them", () => {
    expect(rangeLabel("week", new Date(2026, 7, 31))).toContain("–");
  });
});

describe("date params", () => {
  it("round-trips without a timezone", () => {
    expect(toDateParam(wed)).toBe("2026-08-19");
    expect(fromDateParam("2026-08-19", new Date()).getDate()).toBe(19);
  });

  it("falls back on rubbish", () => {
    const fallback = new Date(2026, 0, 1);
    expect(fromDateParam("yesterday", fallback)).toBe(fallback);
    expect(fromDateParam(undefined, fallback)).toBe(fallback);
  });
});

describe("startOfWeek", () => {
  it("is idempotent", () => {
    const once = startOfWeek(wed);
    expect(startOfWeek(once).getTime()).toBe(once.getTime());
  });
});
