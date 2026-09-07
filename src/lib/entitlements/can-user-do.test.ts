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
  scheduling: false,
  drafts: "none",
  funnels: false,
  researchCreditsPerMonth: 0,
  researchSourcesMax: 0,
  researchRefreshHours: 24,
};

// Starter — the $8 tier (2026-09-03). Its whole shape is "everything that
// costs us nothing", so it is the row that proves the two ideas can coexist:
// unlimited posting AND no scheduling, no X, no research.
const STARTER_LIMITS: PlanLimits = {
  postsPerDay: null,
  maxConnectedAccountsPerWorkspace: null,
  maxWorkspaces: 2,
  platforms: [
    "instagram",
    "facebook",
    "threads",
    "tiktok",
    "youtube",
    "snapchat",
    "linkedin",
    "pinterest",
  ],
  xPostsPerMonth: 0,
  xLinksAllowed: false,
  dmRulesMax: null,
  dmSendsPerMonth: 5000,
  videoUploadMinutesPerMonth: 300,
  scheduling: false,
  drafts: "text",
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
  scheduling: true,
  drafts: "any",
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

function starter(
  usage: Partial<EntitlementSnapshot["usage"]> = {},
): EntitlementSnapshot {
  return {
    planId: "starter",
    limits: STARTER_LIMITS,
    usage: { ...ZERO_USAGE, ...usage },
  };
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
    scheduling: false,
    drafts: "none",
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

  // `scheduling` arrived after the rows did, so unlike everything else here
  // it is optional — and it defaults the generous way. A migration that has
  // not landed yet must not quietly take scheduling away from someone paying
  // for it; the Free row says false out loud.
  it("treats a missing scheduling key as allowed", () => {
    const withoutScheduling: Record<string, unknown> = { ...VALID_JSONB };
    delete withoutScheduling.scheduling;
    expect(parsePlanLimits(withoutScheduling).scheduling).toBe(true);
  });

  it("still refuses a scheduling key that is not a boolean", () => {
    expect(() =>
      parsePlanLimits({ ...VALID_JSONB, scheduling: "yes" }),
    ).toThrow(PlanLimitsParseError);
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

describe("scheduling", () => {
  const free = (): EntitlementSnapshot => ({
    planId: "free",
    limits: FREE_LIMITS,
    usage: ZERO_USAGE,
  });
  const pro = (): EntitlementSnapshot => ({
    planId: "pro",
    limits: PRO_LIMITS,
    usage: ZERO_USAGE,
  });

  it("refuses a scheduled post on Free", () => {
    expect(denialCode(free(), { type: "schedule_post" })).toBe(
      "scheduling_locked",
    );
  });

  // The refusal has to name the two things that still work, or it reads as
  // "you cannot post", which is not what it says.
  it("says what Free can still do", () => {
    const decision = canUserDo(free(), { type: "schedule_post" });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reason).toContain("post now");
      expect(decision.reason).toContain("draft");
    }
  });

  it("allows it on a paid plan", () => {
    expect(canUserDo(pro(), { type: "schedule_post" }).allowed).toBe(true);
  });

  // Publishing now is untouched by any of this — the gate is about how long
  // we hold the media, not about whether the person may post.
  it("leaves publish-now alone on Free", () => {
    expect(
      canUserDo(free(), { type: "publish_post", platform: "instagram" })
        .allowed,
    ).toBe(true);
  });
});

// Starter is the first plan where "unlimited posting" and "no scheduling"
// are true at the same time, so these pin the combination rather than any one
// limit. If a later change makes unlimited posting imply scheduling, or makes
// an explicit platform list imply X, one of these fails.
describe("the Starter plan", () => {
  it("posts without limit, however many have gone out today", () => {
    expect(
      canUserDo(starter({ postsToday: 500 }), {
        type: "publish_post",
        platform: "instagram",
      }).allowed,
    ).toBe(true);
  });

  it("still cannot schedule — the one gate that costs us storage", () => {
    expect(denialCode(starter(), { type: "schedule_post" })).toBe(
      "scheduling_locked",
    );
  });

  it("cannot publish to X, the one platform that bills per post", () => {
    expect(
      denialCode(starter(), { type: "publish_post", platform: "x" }),
    ).toBe("plan_platform_locked");
  });

  it("names X rather than printing its id in the refusal", () => {
    const decision = canUserDo(starter(), {
      type: "publish_post",
      platform: "x",
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toContain("X");
  });

  it("publishes to every platform on its list", () => {
    for (const platform of STARTER_LIMITS.platforms ?? []) {
      expect(
        canUserDo(starter(), { type: "publish_post", platform }).allowed,
      ).toBe(true);
    }
  });

  it("caps workspaces at 2, like Free", () => {
    expect(
      denialCode(starter({ workspaceCount: 2 }), { type: "create_workspace" }),
    ).toBe("workspace_cap");
  });

  it("connects accounts without a per-workspace cap", () => {
    expect(
      canUserDo(starter({ connectedAccountsInWorkspace: 40 }), {
        type: "connect_platform",
        platform: "instagram",
      }).allowed,
    ).toBe(true);
  });

  it("sends DMs up to 5,000 a month and refuses the next one", () => {
    expect(
      canUserDo(starter({ dmSendsThisMonth: 4999 }), { type: "send_dm" })
        .allowed,
    ).toBe(true);
    expect(
      denialCode(starter({ dmSendsThisMonth: 5000 }), { type: "send_dm" }),
    ).toBe("dm_send_cap");
  });

  it("has no research — it is the tier defined by costing us nothing", () => {
    expect(denialCode(starter(), { type: "use_research" })).toBe(
      "research_locked",
    );
  });

  it("parses as a valid plans.limits row", () => {
    expect(
      parsePlanLimits({
        posts_per_day: null,
        max_connected_accounts_per_workspace: null,
        max_workspaces: 2,
        platforms: STARTER_LIMITS.platforms,
        x_posts_per_month: 0,
        x_links_allowed: false,
        dm_rules_max: null,
        dm_sends_per_month: 5000,
        video_upload_minutes_per_month: 300,
        scheduling: false,
        drafts: "text",
        funnels: false,
        research_credits_per_month: 0,
        research_sources_max: 0,
        research_refresh_hours: 24,
      }),
    ).toEqual(STARTER_LIMITS);
  });
});

// Drafts are a ladder rather than a flag, because the two halves of a draft
// cost different amounts: a caption is a few hundred bytes, and the video sits
// in the bucket until the post goes out or somebody deletes it.
describe("keeping an unfinished post", () => {
  it("Free keeps nothing, with or without media", () => {
    expect(denialCode(free(), { type: "save_draft", hasMedia: false })).toBe(
      "drafts_locked",
    );
    expect(denialCode(free(), { type: "save_draft", hasMedia: true })).toBe(
      "drafts_locked",
    );
  });

  it("Starter keeps the words and not the video", () => {
    expect(
      canUserDo(starter(), { type: "save_draft", hasMedia: false }).allowed,
    ).toBe(true);
    expect(denialCode(starter(), { type: "save_draft", hasMedia: true })).toBe(
      "media_drafts_locked",
    );
  });

  it("Pro keeps both", () => {
    expect(canUserDo(pro(), { type: "save_draft", hasMedia: false }).allowed).toBe(
      true,
    );
    expect(canUserDo(pro(), { type: "save_draft", hasMedia: true }).allowed).toBe(
      true,
    );
  });

  it("tells a Starter user what to do about it rather than only refusing", () => {
    const decision = canUserDo(starter(), { type: "save_draft", hasMedia: true });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reason).toMatch(/remove the file|post it now/i);
    }
  });

  // A missing key is the generous answer, exactly as `scheduling` is. The
  // migration adding it runs before the code reading it, and a key that has
  // not landed must never take drafts from somebody paying for them.
  it("treats a plans row with no drafts key as keeping everything", () => {
    const limits = parsePlanLimits({
      posts_per_day: null,
      platforms: null,
      max_connected_accounts_per_workspace: null,
      max_workspaces: null,
      x_posts_per_month: 0,
      x_links_allowed: false,
      dm_rules_max: null,
      dm_sends_per_month: 0,
      video_upload_minutes_per_month: 0,
      funnels: false,
      research_credits_per_month: 0,
      research_sources_max: 0,
      research_refresh_hours: 24,
    });
    expect(limits.drafts).toBe("any");
  });

  it("refuses a plans row whose drafts value is not one of the three", () => {
    const row = {
      posts_per_day: null,
      platforms: null,
      max_connected_accounts_per_workspace: null,
      max_workspaces: null,
      x_posts_per_month: 0,
      x_links_allowed: false,
      dm_rules_max: null,
      dm_sends_per_month: 0,
      video_upload_minutes_per_month: 0,
      funnels: false,
      research_credits_per_month: 0,
      research_sources_max: 0,
      research_refresh_hours: 24,
    };
    expect(() => parsePlanLimits({ ...row, drafts: "sometimes" })).toThrow(
      PlanLimitsParseError,
    );
    // …and the three that are valid still parse, so the guard above is not
    // simply rejecting everything.
    for (const value of ["none", "text", "any"]) {
      expect(parsePlanLimits({ ...row, drafts: value }).drafts).toBe(value);
    }
  });
});

