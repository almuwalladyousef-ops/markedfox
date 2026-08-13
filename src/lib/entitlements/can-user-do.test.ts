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
  postsPerWeek: 10,
  platforms: ["instagram", "tiktok", "youtube"],
  xPostsPerMonth: 0,
  xLinksAllowed: false,
  dmRulesMax: 1,
  dmSendsPerMonth: 200,
  videoUploadMinutesPerMonth: 60,
  funnels: false,
  researchCreditsPerMonth: 0,
};

const PRO_LIMITS: PlanLimits = {
  postsPerWeek: null,
  platforms: null,
  xPostsPerMonth: 300,
  xLinksAllowed: false,
  dmRulesMax: null,
  dmSendsPerMonth: 10000,
  videoUploadMinutesPerMonth: 600,
  funnels: true,
  researchCreditsPerMonth: 0,
};

const ZERO_USAGE: EntitlementSnapshot["usage"] = {
  postsThisWeek: 0,
  xPostsThisMonth: 0,
  dmSendsThisMonth: 0,
  dmRuleCount: 0,
  videoMinutesThisMonth: 0,
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

  it("Free is denied X, Facebook, Threads, LinkedIn, Pinterest", () => {
    for (const platform of ["x", "facebook", "threads", "linkedin", "pinterest"] as const) {
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
    expect(canUserDo(free({ postsThisWeek: 9 }), { type: "publish_post", platform: "instagram" }).allowed).toBe(true);
  });

  it("Free denies post #11", () => {
    expect(denialCode(free({ postsThisWeek: 10 }), { type: "publish_post", platform: "instagram" })).toBe("posts_weekly_cap");
  });

  it("Pro has no weekly cap (null = unlimited)", () => {
    expect(canUserDo(pro({ postsThisWeek: 5000 }), { type: "publish_post", platform: "instagram" }).allowed).toBe(true);
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

describe("parsePlanLimits", () => {
  const VALID_JSONB = {
    posts_per_week: 10,
    platforms: ["instagram", "tiktok", "youtube"],
    x_posts_per_month: 0,
    x_links_allowed: false,
    dm_rules_max: 1,
    dm_sends_per_month: 200,
    video_upload_minutes_per_month: 60,
    funnels: false,
    research_credits_per_month: 0,
  };

  it("parses the seed shape", () => {
    expect(parsePlanLimits(VALID_JSONB)).toEqual(FREE_LIMITS);
  });

  it("parses null as unlimited", () => {
    const parsed = parsePlanLimits({
      ...VALID_JSONB,
      posts_per_week: null,
      platforms: null,
      dm_rules_max: null,
    });
    expect(parsed.postsPerWeek).toBeNull();
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
