import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// Configuration drift, pinned.
//
// Both env templates were already wrong once in a way nothing could catch:
// `deploy/env.production.example` — the file the owner copies onto a fresh
// droplet — had never been given X, YouTube or Snapchat after those adapters
// shipped. A box provisioned from it loses four platforms silently, because a
// missing key is a "Setup needed" toggle rather than an error.
//
// So the rule is mechanical: every variable the app reads at runtime appears
// in both templates. Adding an integration without documenting its key now
// fails here rather than on somebody's next deploy.

const ROOT = join(__dirname, "..", "..");
const SRC = join(ROOT, "src");

/** Vars read only by local tooling, documented at their point of use. */
const SCRIPT_ONLY = new Set(["APP_URL", "SMOKE_BASE", "SCHEDULER_TARGET"]);

/** Set by the platform, not by us. */
const RUNTIME_PROVIDED = new Set(["NODE_ENV", "NEXT_RUNTIME", "PORT", "TZ"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Every env var the app itself reads. */
function usedInApp(): Set<string> {
  const names = new Set<string>();
  for (const file of walk(SRC)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
      names.add(match[1]);
    }
    for (const match of source.matchAll(/requireEnv\(\s*"([A-Z0-9_]+)"/g)) {
      names.add(match[1]);
    }
    // The research generator reads through a destructured env object.
    for (const match of source.matchAll(/\benv\.([A-Z][A-Z0-9_]{3,})/g)) {
      names.add(match[1]);
    }
  }
  for (const provided of RUNTIME_PROVIDED) names.delete(provided);
  for (const script of SCRIPT_ONLY) names.delete(script);
  return names;
}

/** Every var a template mentions, commented-out lines included — a commented
 *  key is still documentation of what the key is called. */
function documentedIn(relativePath: string): Set<string> {
  const source = readFileSync(join(ROOT, relativePath), "utf8");
  const names = new Set<string>();
  for (const match of source.matchAll(/^#?\s*([A-Z0-9_]+)=/gm)) names.add(match[1]);
  return names;
}

describe("env templates", () => {
  const used = usedInApp();

  it("finds the variables the app reads", () => {
    // A sanity floor: if the scan silently matched nothing, every assertion
    // below would pass while proving nothing.
    expect(used.size).toBeGreaterThan(15);
    expect(used).toContain("STRIPE_SECRET_KEY");
    expect(used).toContain("TOKEN_ENCRYPTION_KEY");
  });

  for (const template of [".env.example", "deploy/env.production.example"]) {
    it(`${template} documents every variable the app reads`, () => {
      const documented = documentedIn(template);
      const missing = [...used].filter((name) => !documented.has(name)).sort();
      expect(missing, `${template} is missing: ${missing.join(", ")}`).toEqual([]);
    });
  }

  // The production template is the one that gets copied onto a box, so it
  // must not be a subset of the local one by accident.
  it("keeps the production template in step with the local one", () => {
    const local = documentedIn(".env.example");
    const production = documentedIn("deploy/env.production.example");
    const missing = [...local]
      .filter((name) => used.has(name) && !production.has(name))
      .sort();
    expect(missing, `deploy template is missing: ${missing.join(", ")}`).toEqual([]);
  });

  // Secrets belong in .env.local, which is gitignored. A template that ships
  // a filled-in value is a leaked credential in git history.
  it("ships no filled-in secret values", () => {
    for (const template of [".env.example", "deploy/env.production.example"]) {
      const source = readFileSync(join(ROOT, template), "utf8");
      for (const [line, name, value] of source.matchAll(
        /^([A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD))=(.+)$/gm,
      ) as unknown as [string, string, string][]) {
        expect(
          value.trim(),
          `${template}: ${name} has a value — ${line}`,
        ).toBe("");
      }
    }
  });
});
