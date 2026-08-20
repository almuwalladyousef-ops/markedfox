import { describe, expect, it } from "vitest";

import { buildSteps, isValidAnswer, progress } from "./steps";

const facts = {
  connectedPlatforms: [] as never[],
  postCount: 0,
  ruleCount: 0,
  researchSourceCount: 0,
  planId: "free",
  researchAllowed: false,
};

describe("buildSteps", () => {
  it("marks a step done from real state, not from a click", () => {
    const steps = buildSteps({ ...facts, postCount: 3 });
    expect(steps.find((s) => s.id === "compose")?.done).toBe(true);
    expect(steps.find((s) => s.id === "connect")?.done).toBe(false);
  });

  it("shows the research step locked rather than hiding it", () => {
    const research = buildSteps(facts).find((s) => s.id === "research");
    expect(research).toBeDefined();
    expect(research?.locked).toBe(true);
  });

  it("counts a paid plan as having chosen one", () => {
    expect(
      buildSteps({ ...facts, planId: "pro" }).find((s) => s.id === "billing")?.done,
    ).toBe(true);
  });
});

describe("progress", () => {
  it("ignores locked steps in both the count and the next suggestion", () => {
    // Research is locked on Free, so it must not be what we tell them to do
    // next, and it must not make the counter look worse than it is.
    const { done, total, next } = progress(buildSteps({ ...facts, postCount: 1 }));
    expect(total).toBe(4);
    expect(done).toBe(1);
    expect(next?.id).toBe("connect");
  });

  it("returns no next step once everything actionable is done", () => {
    const { next, done, total } = progress(
      buildSteps({
        connectedPlatforms: ["instagram"],
        postCount: 1,
        ruleCount: 1,
        researchSourceCount: 1,
        planId: "studio",
        researchAllowed: true,
      }),
    );
    expect(next).toBeNull();
    expect(done).toBe(total);
  });
});

describe("isValidAnswer", () => {
  it("accepts a listed option and rejects anything else", () => {
    expect(isValidAnswer("tenure", "veteran")).toBe(true);
    expect(isValidAnswer("tenure", "forever")).toBe(false);
    expect(isValidAnswer("nonsense", "high")).toBe(false);
  });
});
