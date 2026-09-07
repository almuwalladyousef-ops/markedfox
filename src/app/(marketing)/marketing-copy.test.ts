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
      // Any number, not the literal 300. Studio's allowance went to 400 on
      // 2026-09-07 and this assertion failed for a plan that settles X
      // perfectly well — it was pinning Pro's figure, not the rule.
      const settled =
        /\d[\d,]* posts per month/.test(text) ||
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

// A layout rule that cost 196px of sideways scroll on a 390px phone, pinned
// here because nothing else in the suite can see geometry.
//
// The comparison table is correctly `min-w-[620px]` inside `overflow-x-auto`,
// so the TABLE scrolls in its own box. But its cells carry `.sr-only` labels,
// and `.sr-only` is `position: absolute`. An absolutely positioned box is
// clipped by an overflow ancestor only when that ancestor is also its
// containing block — so without `relative` on the scroller those labels
// resolved against the initial containing block, sat at x=585 in the
// document, and dragged the whole PAGE sideways into blank space.
describe("horizontal scrollers containing absolutely positioned children", () => {
  const source = readFileSync(join(HERE, "page.tsx"), "utf8");

  it("the comparison table's scroller is a containing block", () => {
    const scroller = source
      .split("\n")
      .find((line) => line.includes("overflow-x-auto") && line.includes("mt-12"));
    expect(scroller, "the comparison table scroller moved or was renamed").toBeDefined();
    expect(scroller, "add `relative`, or .sr-only escapes and the page scrolls").toContain("relative");
  });
});


// The landing page asks "monthly or yearly?" twice — once in the stack
// calculator, once in the plan grid. They are the same question, and they used
// to be two independent useStates with DIFFERENT defaults: the calculator
// opened on yearly and the grid on monthly, so the page disagreed with itself
// before anybody pressed anything, and setting one left the other alone.
//
// Geometry and clicks cannot be asserted here, so this pins the structural
// fact that made it possible: neither component owns the state any more.
describe("the billing toggle is one control, not two", () => {
  const read = (path: string) => readFileSync(join(HERE, path), "utf8");

  it("neither the calculator nor the grid holds its own interval state", () => {
    for (const path of [
      "_components/home/stack-calculator.tsx",
      "pricing/plan-grid.tsx",
    ]) {
      const source = read(path);
      expect(source, `${path} must read the shared interval`).toContain(
        "useBillingInterval",
      );
      expect(
        /useState[<(][^)]*(yearly|monthly|interval)/i.test(source),
        `${path} still owns a private billing-interval useState`,
      ).toBe(false);
    }
  });

  it("the landing page puts both under one provider", () => {
    const source = read("page.tsx");
    const block = source.slice(
      source.indexOf("<BillingIntervalProvider>"),
      source.indexOf("</BillingIntervalProvider>"),
    );
    expect(block, "the provider must wrap the calculator").toContain("<Stack />");
    expect(block, "the provider must wrap the plan grid").toContain("<Plans />");
  });

  it("both start on the same interval, since one of them is now the other", () => {
    const provider = read("_components/billing-interval.tsx");
    expect(provider).toContain('initial = "monthly"');
  });
});
