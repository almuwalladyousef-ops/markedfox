import type { Platform } from "@/lib/platforms/types";

// camelCase mirror of the `plans.limits` jsonb column. Convention everywhere:
// null = unlimited/unrestricted. Raising a cap for one account is a row edit
// in the plans table, never code.
export interface PlanLimits {
  /** null = unlimited. Free is 2/day; every paid plan is unlimited, because
   *  posting costs $0 on every platform except X. */
  postsPerDay: number | null;
  /** null = all platforms. Every plan is null since 2026-08-16: platforms are
   *  no longer gated by identity, connected-account count is the lever. */
  platforms: Platform[] | null;
  /** Total connected accounts across all platforms. null = unlimited.
   *  This is the Free-plan lever: three accounts, any mix of platforms. */
  maxConnectedAccounts: number | null;
  /** 0 = X locked entirely. Never null: X is metered upstream. */
  xPostsPerMonth: number;
  /** False on every plan today — the 13x cost control ($0.015 vs $0.20). */
  xLinksAllowed: boolean;
  dmRulesMax: number | null;
  dmSendsPerMonth: number;
  videoUploadMinutesPerMonth: number;
  funnels: boolean;
  researchCreditsPerMonth: number;
}

export interface EntitlementSnapshot {
  planId: string;
  limits: PlanLimits;
  usage: {
    /** usage kind 'post_publish', trailing 24 hours. Trailing rather than
     *  calendar-day so the cap cannot be doubled by posting either side of
     *  midnight. */
    postsToday: number;
    /** usage kind 'x_post', current UTC calendar month. */
    xPostsThisMonth: number;
    /** usage kind 'dm_send', current UTC calendar month. */
    dmSendsThisMonth: number;
    /** count(dm_rules) in the workspace. */
    dmRuleCount: number;
    /** count(connections) in the workspace, all platforms. */
    connectedAccountCount: number;
    /** usage kind 'video_upload' amounts summed, current UTC calendar month. */
    videoMinutesThisMonth: number;
  };
}

export type Action =
  | { type: "publish_post"; platform: Platform; hasExternalLink?: boolean }
  | { type: "connect_platform"; platform: Platform }
  | { type: "create_dm_rule" }
  | { type: "send_dm" }
  | { type: "upload_video"; minutes: number }
  | { type: "use_funnels" };

export type DenialCode =
  | "plan_platform_locked"
  | "connected_accounts_cap"
  | "posts_daily_cap"
  | "x_monthly_cap"
  | "x_links_blocked"
  | "dm_rule_cap"
  | "dm_send_cap"
  | "video_minutes_cap"
  | "funnels_locked";

export type Decision =
  | { allowed: true }
  | { allowed: false; code: DenialCode; reason: string };

export class PlanLimitsParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanLimitsParseError";
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

// Validates a plans.limits jsonb value. Throws on any malformed row: a plan
// with broken limits must fail loudly, not silently grant or deny.
export function parsePlanLimits(json: unknown): PlanLimits {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    throw new PlanLimitsParseError("plans.limits must be a JSON object");
  }
  const o = json as Record<string, unknown>;

  const nullableNumber = (field: string): number | null => {
    const v = o[field];
    if (v === null) return null;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    throw new PlanLimitsParseError(`limits.${field} must be a number or null`);
  };
  const requiredNumber = (field: string): number => {
    const v = o[field];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    throw new PlanLimitsParseError(`limits.${field} must be a number`);
  };
  const requiredBoolean = (field: string): boolean => {
    const v = o[field];
    if (typeof v === "boolean") return v;
    throw new PlanLimitsParseError(`limits.${field} must be a boolean`);
  };

  const platformsRaw = o["platforms"];
  let platforms: Platform[] | null;
  if (platformsRaw === null) {
    platforms = null;
  } else if (isStringArray(platformsRaw)) {
    platforms = platformsRaw as Platform[];
  } else {
    throw new PlanLimitsParseError(
      "limits.platforms must be an array of platform ids or null",
    );
  }

  return {
    postsPerDay: nullableNumber("posts_per_day"),
    platforms,
    maxConnectedAccounts: nullableNumber("max_connected_accounts"),
    xPostsPerMonth: requiredNumber("x_posts_per_month"),
    xLinksAllowed: requiredBoolean("x_links_allowed"),
    dmRulesMax: nullableNumber("dm_rules_max"),
    dmSendsPerMonth: requiredNumber("dm_sends_per_month"),
    videoUploadMinutesPerMonth: requiredNumber(
      "video_upload_minutes_per_month",
    ),
    funnels: requiredBoolean("funnels"),
    researchCreditsPerMonth: requiredNumber("research_credits_per_month"),
  };
}
