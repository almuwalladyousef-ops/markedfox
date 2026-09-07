import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// No emoji in the app's own chrome.
//
// An emoji is a font's opinion of a symbol rather than ours: 💎 rendered as a
// blue gem on one platform and a grey box on another, ⚿ has no glyph in
// several Android fallbacks, and none of them sit at the weight of the type
// beside them. `src/components/icons.tsx` exists to replace them, and this
// stops them coming back one convenient character at a time.
//
// THREE PLACES ARE DELIBERATELY EXEMPT, and the distinction is content versus
// chrome:
//
//   lib/dm/templates.ts        the message a follower actually receives
//   automations/phone-preview  a drawing of an Instagram thread
//   automations/rule-builder   the same, inside the builder
//   (marketing)/…              fake DM bubbles on the landing page
//
// Stripping those would not tidy our interface; it would change what our
// customers send, or make a picture of Instagram stop looking like Instagram.

const ROOTS = [
  join(__dirname, "..", "app", "dashboard"),
  join(__dirname),
];

const EXEMPT = ["phone-preview.tsx", "rule-builder.tsx"];

/**
 * Emoji, plus the two dingbat blocks whose characters behave like them.
 *
 * Deliberately narrow, and the exclusions are the interesting part. Arrows
 * (←, →), geometric shapes (●, ▸) and punctuation (×, ·, —, ‹) are TYPOGRAPHY:
 * they render at the weight of the type around them, they mean the same thing
 * in every font, and replacing them with a 24×24 stroke path would be worse.
 * What is banned is the pictographic set — a font's drawing of an object,
 * which is what varies between platforms and what never matches our type.
 */
const EMOJI =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE0F}]/u;

/** Comments document what was replaced and why, and several of those notes
 *  name the character they replaced. Scanning them would make the record of a
 *  fix indistinguishable from the fix being undone. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...walk(path));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(path);
    }
  }
  return out;
}

describe("the app's own interface carries no emoji", () => {
  const files = ROOTS.flatMap(walk).filter(
    (path) => !EXEMPT.some((name) => path.endsWith(name)),
  );

  it("scans a meaningful number of files", () => {
    // A path typo that made this scan nothing would otherwise pass silently.
    expect(files.length).toBeGreaterThan(40);
  });

  for (const path of files) {
    it(`${path.split("/src/")[1]} uses the icon set`, () => {
      const found = stripComments(readFileSync(path, "utf8")).match(
        new RegExp(EMOJI, "gu"),
      );
      expect(found ?? []).toEqual([]);
    });
  }
});
