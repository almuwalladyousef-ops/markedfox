import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

// Every dashboard page has a loading screen shaped like itself.
//
// A page without one falls back to the nearest loading.tsx above it, which is
// Home's outline — so a new page added without its own would open on a
// picture of a different page. The settings panes are the one deliberate
// exception: they sit inside the settings layout, whose menu stays on screen,
// so settings/loading.tsx is the right shape for all of them.

const ROOT = __dirname;
const SHARED = [join(ROOT, "settings")];

function pageDirs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...pageDirs(path));
  }
  if (existsSync(join(dir, "page.tsx"))) out.push(dir);
  return out;
}

describe("dashboard loading screens", () => {
  it("gives every page its own loading.tsx, or a shared one that fits it", () => {
    const missing = pageDirs(ROOT).filter((dir) => {
      if (existsSync(join(dir, "loading.tsx"))) return false;
      return !SHARED.some((shared) => dir.startsWith(`${shared}/`) || dir === shared);
    });
    expect(missing.map((dir) => relative(ROOT, dir) || ".")).toEqual([]);
  });
});
