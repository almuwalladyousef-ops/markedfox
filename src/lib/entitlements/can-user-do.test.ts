import { describe, expect, it } from "vitest";

import { canUserDo } from "./can-user-do";
import {
  parsePlanLimits,
  PlanLimitsParseError,
  type EntitlementSnapshot,
  type PlanLimits,
} from "./types";

// Mirrors the seed rows in the initial schema migration.
const FREE_LIMITS: PlanLimits = {
  postsPerDay: 2,
  maxConnectedAccountsPerWorkspace: 3,
  maxWorkspaces: 2,
  // Free carries the five it includes; X, LinkedIn and Pinterest are excluded
  // and the UI shows them as toggles wearing an upgrade badge.
  platforms: ["instagram", "facebook", "threads", "tiktok", "youtube"],
  xPostsPerMonth: 0,
  xLinksAllowed: false,
  dmRulesMax: 1,
  dmSendsPerMonth: 200,
  videoUploadMinutesPerMonth: 60,
  funnels: false,
  researchCreditsPerMonth: 0,
  researchSourcesMax: 0,
  researchRefreshHours: 24,
};

const PRO_LIMITS: PlanLimits = {
  postsPerDay: null,
  maxConnectedAccountsPerWorkspace: null,
  maxWorkspaces: 5,
  platforms: null,
  xPostsPerMonth: 300,
  xLinksAllowed: false,
  dmRulesMax: null,
  dmSendsPerMonth: 10000,
  videoUploadMinutesPerMonth: 600,
  funnels: true,
  researchCreditsPerMonth: 0,
  researchSourcesMax: 0,
  researchRefreshHours: 24,
};

const ZERO_USAGE: EntitlementSnapshot["usage"] = {
  postsToday: 0,
  connectedAccountsInWorkspace: 0,
  workspaceCount: 1,
  xPostsThisMonth: 0,
  dmSendsThisMonth: 0,
  dmRuleCount: 0,
  researchSourceCount: 0,
  videoMinutesThisMonth: 0,
  researchCreditsThisMonth: 0,
};

function free(usage: Partial<EntitlementSnapshot["usage"]> = {}): EntitlementSnapshot {
  return { planId: "free", limits: FREE_LIMITS, usage: { ...ZERO_USAGE, ...usage } };
}

function pro(usage: Partial<EntitlementSnapshot["usage"]> = {}): EntitlementSnapshot {
  return { planId: "pro", limits: PRO_LIMITS, usage: { ...ZERO_USAGE, ...usage } };
}

function denialCode(snapshot: EntitlementSnapshot, action: Parameters<typeof canUserDo>[1]) {
  const decision = canUserDo(snapshot, action);
  return decision.allowed ? null : decision.code;
}

describe("canUserDo — platform gating", () => {
  it("Free publishes to its three platforms", () => {
    for (const platform of ["instagram", "tiktok", "youtube"] as const) {
      expect(canUserDo(free(), { type: "publish_post", platform }).allowed).toBe(true);
    }
  });

  it("Free may publish to the platforms its plan includes", () => {
    for (const platform of ["instagram", "facebook", "threads"] as const) {
      expect(canUserDo(free(), { type: "publish_post", platform }).allowed).toBe(true);
    }
    for (const platform of ["x", "linkedin", "pinterest"] as const) {
      expect(denialCode(free(), { type: "publish_post", platform })).toBe("plan_platform_locked");
    }
  });

  it("Free cannot connect a locked platform either", () => {
    expect(denialCode(free(), { type: "connect_platform", platform: "x" })).toBe("plan_platform_locked");
  });

  it("Pro reaches every platform (platforms: null = all)", () => {
    for (const platform of ["instagram", "x", "threads", "facebook", "tiktok", "youtube", "linkedin", "pinterest"] as const) {
      expect(canUserDo(pro(), { type: "publish_post", platform }).allowed).toBe(true);
    }
  });
});

describe("canUserDo — weekly post cap", () => {
  it("Free allows post #10", () => {
    expect(canUserDo(free({ postsToday: 1 }), { type: "publish_post", platform: "instagram" }).allowed).toBe(true);
  });

  it("Free denies post #11", () => {
    expect(denialCode(free({ postsToday: 2 }), { type: "publish_post", platform: "instagram" })).toBe("posts_daily_cap");
  });

  it("Pro has no weekly cap (null = unlimited)", () => {
    expect(canUserDo(pro({ postsToday: 5000 }), { type: "publish_post", platform: "instagram" }).allowed).toBe(true);
  });
});

describe("canUserDo — X rules", () => {
  it("Pro allows X post #300", () => {
    expect(canUserDo(pro({ xPostsThisMonth: 299 }), { type: "publish_post", platform: "x" }).allowed).toBe(true);
  });

  it("Pro denies X post #301", () => {
    expect(denialCode(pro({ xPostsThisMonth: 300 }), { type: "publish_post", platform: "x" })).toBe("x_monthly_cap");
  });

  it("Pro denies an X post with an external link even under the cap", () => {
    expect(denialCode(pro(), { type: "publish_post", platform: "x", hasExternalLink: true })).toBe("x_links_blocked");
  });

  it("Free denial for X is the platform lock, not the cap", () => {
    expect(denialCode(free(), { type: "publish_post", platform: "x", hasExternalLink: true })).toBe("plan_platform_locked");
  });
});

describe("canUserDo — DM caps", () => {
  it("Free allows the first DM rule and denies the second", () => {
    expect(canUserDo(free(), { type: "create_dm_rule" }).allowed).toBe(true);
    expect(denialCode(free({ dmRuleCount: 1 }), { type: "create_dm_rule" })).toBe("dm_rule_cap");
  });

  it("Pro has unlimited rules but a monthly send cap", () => {
    expect(canUserDo(pro({ dmRuleCount: 500 }), { type: "create_dm_rule" }).allowed).toBe(true);
    expect(canUserDo(pro({ dmSendsThisMonth: 9999 }), { type: "send_dm" }).allowed).toBe(true);
    expect(denialCode(pro({ dmSendsThisMonth: 10000 }), { type: "send_dm" })).toBe("dm_send_cap");
  });

  it("Free send cap enforced", () => {
    expect(denialCode(free({ dmSendsThisMonth: 200 }), { type: "send_dm" })).toBe("dm_send_cap");
  });
});

describe("canUserDo — video minutes and funnels", () => {
  it("upload that fits passes; upload that overflows is denied", () => {
    expect(canUserDo(free({ videoMinutesThisMonth: 50 }), { type: "upload_video", minutes: 10 }).allowed).toBe(true);
    expect(denialCode(free({ videoMinutesThisMonth: 50 }), { type: "upload_video", minutes: 11 })).toBe("video_minutes_cap");
  });

  it("funnels: locked on Free, open on Pro", () => {
    expect(denialCode(free(), { type: "use_funnels" })).toBe("funnels_locked");
    expect(canUserDo(pro(), { type: "use_funnels" }).allowed).toBe(true);
  });
});

describe("connected-account cap (replaces the old platform gate)", () => {
  it("includes Facebook and Threads on Free, excludes X/LinkedIn/Pinterest", () => {
    for (const platform of ["instagram", "facebook", "threads", "tiktok", "youtube"] as const) {
      expect(
        canUserDo(free(), { type: "connect_platform", platform }).allowed,
      ).toBe(true);
    }
    for (const platform of ["x", "linkedin", "pinterest"] as const) {
      expect(
        denialCode(free(), { type: "connect_platform", platform }),
      ).toBe("plan_platform_locked");
    }
  });

  it("caps accounts PER WORKSPACE, not across the account", () => {
    // Three in this workspace is the cap; a second workspace gets its own three.
    expect(
      denialCode(free({ connectedAccountsInWorkspace: 3 }), {
        type: "connect_platform",
        platform: "instagram",
      }),
    ).toBe("connected_accounts_cap");
  });

  it("caps workspaces by plan", () => {
    expect(canUserDo(free({ workspaceCount: 1 }), { type: "create_workspace" }).allowed).toBe(true);
    expect(denialCode(free({ workspaceCount: 2 }), { type: "create_workspace" })).toBe("workspace_cap");
    expect(canUserDo(pro({ workspaceCount: 4 }), { type: "create_workspace" }).allowed).toBe(true);
    expect(denialCode(pro({ workspaceCount: 5 }), { type: "create_workspace" })).toBe("workspace_cap");
  });

  it("refuses the fourth account on Free", () => {
    expect(
      canUserDo(free({ connectedAccountsInWorkspace: 2 }), {
        type: "connect_platform",
        platform: "facebook",
      }).allowed,
    ).toBe(true);
    expect(
      denialCode(free({ connectedAccountsInWorkspace: 3 }), {
        type: "connect_platform",
        platform: "facebook",
      }),
    ).toBe("connected_accounts_cap");
  });

  it("does not cap accounts on paid plans", () => {
    expect(
      canUserDo(pro({ connectedAccountsInWorkspace: 500 }), {
        type: "connect_platform",
        platform: "facebook",
      }).allowed,
    ).toBe(true);
  });

  it("still locks X on Free — it is the one platform that costs money", () => {
    // Deliberately refused at CONNECT, not just at publish: letting someone
    // link an X account they could never post from would be a worse
    // experience than saying so upfront.
    expect(
      denialCode(free(), { type: "connect_platform", platform: "x" }),
    ).toBe("plan_platform_locked");
    // Paid plans connect X and post within their monthly allowance.
    expect(
      canUserDo(pro(), { type: "connect_platform", platform: "x" }).allowed,
    ).toBe(true);
    expect(
      denialCode(pro({ xPostsThisMonth: 300 }), { type: "publish_post", platform: "x" }),
    ).toBe("x_monthly_cap");
  });
});

describe("parsePlanLimits", () => {
  const VALID_JSONB = {
    posts_per_day: 2,
    platforms: ["instagram", "facebook", "threads", "tiktok", "youtube"],
    max_connected_accounts_per_workspace: 3,
    max_workspaces: 2,
    x_posts_per_month: 0,
    x_links_allowed: false,
    dm_rules_max: 1,
    dm_sends_per_month: 200,
    video_upload_minutes_per_month: 60,
    funnels: false,
    research_credits_per_month: 0,
    research_sources_max: 0,
    research_refresh_hours: 24,
  };

  it("parses the seed shape", () => {
    expect(parsePlanLimits(VALID_JSONB)).toEqual(FREE_LIMITS);
  });

  it("parses null as unlimited", () => {
    const parsed = parsePlanLimits({
      ...VALID_JSONB,
      posts_per_day: null,
      platforms: null,
      dm_rules_max: null,
    });
    expect(parsed.postsPerDay).toBeNull();
    expect(parsed.platforms).toBeNull();
    expect(parsed.dmRulesMax).toBeNull();
  });

  it("throws on malformed rows instead of silently granting or denying", () => {
    expect(() => parsePlanLimits(null)).toThrow(PlanLimitsParseError);
    expect(() => parsePlanLimits("free")).toThrow(PlanLimitsParseError);
    expect(() => parsePlanLimits({})).toThrow(PlanLimitsParseError);
    expect(() => parsePlanLimits({ ...VALID_JSONB, x_posts_per_month: null })).toThrow(PlanLimitsParseError);
    expect(() => parsePlanLimits({ ...VALID_JSONB, x_links_allowed: "no" })).toThrow(PlanLimitsParseError);
    expect(() => parsePlanLimits({ ...VALID_JSONB, platforms: [1, 2] })).toThrow(PlanLimitsParseError);
  });
});

describe("canUserDo — research", () => {
  // Research is the Studio pillar: Free and Pro carry zero credits, so the
  // capability itself is off, not merely capped.
  const studioLimits = {
    ...PRO_LIMITS,
    researchCreditsPerMonth: 100,
    researchSourcesMax: 150,
    researchRefreshHours: 12,
  };
  const studio = (usage: Partial<EntitlementSnapshot["usage"]> = {}) => ({
    planId: "studio",
    limits: studioLimits,
    usage: { ...ZERO_USAGE, ...usage },
  });

  it("is locked on a plan with no credit allowance", () => {
    expect(denialCode(free(), { type: "use_research" })).toBe("research_locked");
    expect(denialCode(pro(), { type: "use_research" })).toBe("research_locked");
  });

  it("is open on a plan that has credits", () => {
    expect(canUserDo(studio(), { type: "use_research" }).allowed).toBe(true);
  });

  it("refuses to spend a credit on a plan without research at all", () => {
    expect(
      denialCode(pro(), { type: "spend_research_credits", credits: 1 }),
    ).toBe("research_locked");
  });

  it("allows a generation that fits inside the month's allowance", () => {
    expect(
      canUserDo(studio({ researchCreditsThisMonth: 99 }), {
        type: "spend_research_credits",
        credits: 1,
      }).allowed,
    ).toBe(true);
  });

  it("refuses the generation that would cross the cap", () => {
    expect(
      denialCode(studio({ researchCreditsThisMonth: 100 }), {
        type: "spend_research_credits",
        credits: 1,
      }),
    ).toBe("research_credits_cap");
  });
});
