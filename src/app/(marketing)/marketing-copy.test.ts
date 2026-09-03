import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { PLANS } from "./_components/plans-data";

// The landing page's honesty rules, pinned.
//
// The page borrows its shape from three reference products and none of their
// claims. Two of those are cheap to test: no borrowed social proof (a star
// rating, a "trusted by" count, a testimonial) and no dead label (the house
// rule against "Coming soon" and "Locked", which the dashboard already pins
// in every-platform-shown.test.ts). The third is pricing rule 1 from
// CLAUDE.md: wherever the word "unlimited" appears, the X cap is stated
// beside it, because X bills per post and is never unlimited.

const HERE = __dirname;
const FILES = [
  join(HERE, "page.tsx"),
  ...readdirSync(join(HERE, "_components", "home"))
    .filter((name) => name.endsWith(".tsx"))
    .map((name) => join(HERE, "_components", "home", name)),
  join(HERE, "_components", "plans-data.ts"),
];

const BANNED = [
  /trusted by/i,
  /\d[\d,.]*\s*(k|m)?\+?\s*(creators|users|brands|customers)/i,
  /testimonial/i,
  /★|⭐/,
  /\/\s*5 rating/i,
  /coming soon/i,
  /\bLocked\b/,
];

describe("landing page copy", () => {
  for (const file of FILES) {
    const source = readFileSync(file, "utf8");
    const name = file.slice(HERE.length + 1);

    it(`${name} carries no borrowed social proof or dead labels`, () => {
      for (const pattern of BANNED) {
        expect(source, `${name} matches ${pattern}`).not.toMatch(pattern);
      }
    });

    it(`${name} states the X cap wherever it says "unlimited"`, () => {
      if (/unlimited/i.test(source)) {
        expect(source, name).toMatch(/300/);
      }
    });
  }
});

// The file-level check above only proves the string "300" appears somewhere in
// plans-data.ts. That was enough with one shape of paid plan; Starter has no X
// at all, so a per-plan check is what actually holds the rule: any plan card
// claiming "unlimited" must say, on that same card, where it stands on X.
describe("every plan card that says \"unlimited\" settles X on the card", () => {
  for (const plan of PLANS) {
    it(`${plan.name}`, () => {
      const text = plan.features.map((f) => f.text).join(" | ");
      if (!/unlimited/i.test(text)) return;
      // The three honest ways a card can settle X: a hard number, an outright
      // exclusion, or Enterprise's raised-but-still-a-cap. What none of them
      // may do is let "unlimited" stand unqualified.
      const settled =
        /300 posts per month/.test(text) ||
        /X not included/.test(text) ||
        /[Rr]aised caps on X posts/.test(text);
      expect(
        settled,
        `${plan.name} says "unlimited" but never settles X`,
      ).toBe(true);
    });
  }
});

describe("the plan ladder", () => {
  it("rises in price and never repeats one", () => {
    const priced = PLANS.filter((p) => p.monthly.startsWith("$")).map((p) =>
      Number(p.monthly.slice(1)),
    );
    expect(priced).toEqual([...priced].sort((a, b) => a - b));
    expect(new Set(priced).size).toBe(priced.length);
  });

  it("gives exactly one plan the MOST POPULAR badge", () => {
    expect(PLANS.filter((p) => p.highlight)).toHaveLength(1);
  });

  it("keeps the grid to four columns by banding the contact plan", () => {
    expect(PLANS.filter((p) => !p.contact)).toHaveLength(4);
  });

  it("points every self-serve plan at a signup URL carrying its own id", () => {
    for (const plan of PLANS) {
      if (plan.contact || plan.id === "free") continue;
      expect(plan.cta.href, plan.name).toBe(`/signup?plan=${plan.id}`);
    }
  });
});
