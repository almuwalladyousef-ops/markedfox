import { describe, expect, it } from "vitest";

import {
  MOBILE_CREATE,
  MOBILE_TABS,
  activeMobileTab,
  isMobileCreate,
} from "./mobile-nav";
import { SHELL_SPACES, isRowItem } from "./shell";

// The phone bar is a product decision, not a rendering detail: four flat
// destinations in a fixed order with the composer raised in the middle. These
// pin the order, the routes, and the highlight rule — the last one is what
// used to break silently, because "no tab is lit" looks like a styling bug
// rather than a routing one.

describe("the mobile tab bar", () => {
  it("is Home, Drafts, Feed, Account in that order, with Create between Drafts and Feed", () => {
    expect(MOBILE_TABS.map((tab) => tab.id)).toEqual([
      "home",
      "drafts",
      "feed",
      "account",
    ]);
  });

  it("points every tab at a route that exists in the desktop shell or settings", () => {
    const known = new Set(
      SHELL_SPACES.flatMap((space) => space.rows)
        .filter(isRowItem)
        .map((row) => row.href),
    );
    known.add("/dashboard/settings/accounts");

    for (const tab of MOBILE_TABS) {
      expect(known.has(tab.href), `${tab.id} → ${tab.href}`).toBe(true);
    }
  });

  it("gives every tab an accessible label and a plain-words tip", () => {
    for (const tab of MOBILE_TABS) {
      expect(tab.label.length).toBeGreaterThan(0);
      expect(tab.tip.length).toBeGreaterThan(10);
    }
  });
});

describe("which tab is lit", () => {
  it("lights Home only on the home route itself", () => {
    expect(activeMobileTab("/dashboard")).toBe("home");
    // /dashboard is a prefix of every other route; without the exact-match
    // rule Home would be lit everywhere.
    expect(activeMobileTab("/dashboard/drafts")).not.toBe("home");
    expect(activeMobileTab("/dashboard/research")).not.toBe("home");
  });

  it("lights Drafts on drafts and on the calendar, which has no tab of its own", () => {
    expect(activeMobileTab("/dashboard/drafts")).toBe("drafts");
    expect(activeMobileTab("/dashboard/calendar")).toBe("drafts");
  });

  it("lights Feed on every research route, not just the feed index", () => {
    for (const path of [
      "/dashboard/research",
      "/dashboard/research/channels",
      "/dashboard/research/ideas",
      "/dashboard/research/scripts/abc-123",
      "/dashboard/research/projects/xyz",
    ]) {
      expect(activeMobileTab(path), path).toBe("feed");
    }
  });

  it("lights Account across settings and automations", () => {
    for (const path of [
      "/dashboard/settings",
      "/dashboard/settings/accounts",
      "/dashboard/settings/subscription",
      "/dashboard/automations",
      "/dashboard/automations/new",
    ]) {
      expect(activeMobileTab(path), path).toBe("account");
    }
  });

  it("lights no tab in the composer — the raised button is not a tab", () => {
    expect(activeMobileTab(MOBILE_CREATE.href)).toBeUndefined();
    expect(isMobileCreate("/dashboard/new-post")).toBe(true);
    expect(isMobileCreate("/dashboard/drafts")).toBe(false);
  });

  it("never lights two tabs for one path", () => {
    for (const path of [
      "/dashboard",
      "/dashboard/drafts",
      "/dashboard/calendar",
      "/dashboard/research/channels",
      "/dashboard/settings/accounts",
      "/dashboard/automations/templates",
    ]) {
      const lit = MOBILE_TABS.filter((tab) => tab.id === activeMobileTab(path));
      expect(lit, path).toHaveLength(1);
    }
  });
});
