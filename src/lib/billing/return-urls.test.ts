import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CHECKOUT_RETURN_PATH,
  checkoutReturnUrls,
  normalizeSiteUrl,
  PORTAL_RETURN_PATH,
  portalReturnUrl,
} from "./return-urls";

const APP = join(__dirname, "..", "..", "app");

/** The route file a settings path resolves to. */
function pageFor(path: string): string {
  const rel = path.replace(/^\/dashboard\//, "");
  return join(APP, "dashboard", rel, "page.tsx");
}

describe("checkout return urls", () => {
  it("builds absolute success and cancel urls", () => {
    const { successUrl, cancelUrl } = checkoutReturnUrls("https://markedfox.com");
    expect(successUrl).toBe(
      "https://markedfox.com/dashboard/settings/subscription?checkout=success",
    );
    expect(cancelUrl).toBe(
      "https://markedfox.com/dashboard/settings/subscription?checkout=canceled",
    );
  });

  it("never doubles a slash when the site url has a trailing one", () => {
    const { successUrl } = checkoutReturnUrls("https://markedfox.com/");
    expect(successUrl).not.toContain("com//");
    expect(portalReturnUrl("https://markedfox.com///")).toBe(
      "https://markedfox.com/dashboard/settings/subscription",
    );
  });

  it("falls back to the production host when the env var is unset", () => {
    expect(normalizeSiteUrl(undefined)).toBe("https://markedfox.com");
  });

  // The bug this file exists for. Stripe used to be sent to
  // /dashboard/settings, which is a `redirect()` to the accounts pane — the
  // query string never survived, so the "Payment received" card could not
  // render however correct it was. A return path must be a page that reads
  // the parameter, and the cheapest way to keep that true is to read both
  // files.
  it("returns to a page that renders the outcome rather than one that redirects", () => {
    for (const path of [CHECKOUT_RETURN_PATH, PORTAL_RETURN_PATH]) {
      const source = readFileSync(pageFor(path), "utf8");
      expect(source, `${path} must not redirect away`).not.toMatch(
        /^\s*redirect\(/m,
      );
      expect(source, `${path} must read ?checkout=`).toContain("checkout");
    }
  });

  it("proves the old target really does redirect, so the rule above has teeth", () => {
    const source = readFileSync(pageFor("/dashboard/settings"), "utf8");
    expect(source).toMatch(/redirect\(/);
  });
});
