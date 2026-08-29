import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

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
