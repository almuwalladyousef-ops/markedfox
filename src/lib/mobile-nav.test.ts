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
  it("is Home, Automate, Research, Account in that order, with Create raised between the second and third", () => {
    expect(MOBILE_TABS.map((tab) => tab.id)).toEqual([
      "home",
      "automate",
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
    expect(activeMobileTab("/dashboard/automations")).not.toBe("home");
    expect(activeMobileTab("/dashboard/research")).not.toBe("home");
  });

  // Drafts and the calendar lost their tab on 2026-09-06 and live in Home's
  // three-line menu instead, so Home is what stays lit while you are on them.
  // The rule that matters: some tab is always lit, or the bar looks broken.
  it("lights Home on the two pages inside its own menu", () => {
    expect(activeMobileTab("/dashboard/drafts")).toBe("home");
    expect(activeMobileTab("/dashboard/calendar")).toBe("home");
  });

  it("lights Automate across the automations routes", () => {
    for (const path of [
      "/dashboard/automations",
      "/dashboard/automations/new",
      "/dashboard/automations/templates",
      "/dashboard/automations/abc-123",
    ]) {
      expect(activeMobileTab(path), path).toBe("automate");
    }
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

  it("lights Account across the settings routes only", () => {
    for (const path of [
      "/dashboard/settings",
      "/dashboard/settings/accounts",
      "/dashboard/settings/subscription",
    ]) {
      expect(activeMobileTab(path), path).toBe("account");
    }
  });

  it("lights no tab in the composer — the raised button is not a tab", () => {
    expect(activeMobileTab(MOBILE_CREATE.href)).toBeUndefined();
    expect(isMobileCreate("/dashboard/new-post")).toBe(true);
    expect(isMobileCreate("/dashboard/automations")).toBe(false);
  });

  // Every route the desktop shell can reach, rather than a hand-written list
  // that a new page would quietly fall off. Two tabs owning one path is the
  // failure that hides best: the bar looks fine, it just lights the wrong one.
  it("lights exactly one tab for every route in the desktop shell", () => {
    const routes = [
      ...SHELL_SPACES.flatMap((space) => space.rows)
        .filter(isRowItem)
        .map((row) => row.href),
      "/dashboard/settings/accounts",
      "/dashboard/settings/subscription",
    ];
    for (const path of routes) {
      const id = activeMobileTab(path);
      expect(id, `${path} lights no tab`).toBeDefined();
      const lit = MOBILE_TABS.filter((tab) => tab.id === id);
      expect(lit, path).toHaveLength(1);
    }
  });
});
