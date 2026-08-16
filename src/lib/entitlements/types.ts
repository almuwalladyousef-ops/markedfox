import type { Platform } from "@/lib/platforms/types";

// camelCase mirror of the `plans.limits` jsonb column. Convention everywhere:
// null = unlimited/unrestricted. Raising a cap for one account is a row edit
// in the plans table, never code.
//
// Two scopes, and the distinction matters (owner model, 2026-08-16):
//
//   PER WORKSPACE — connected accounts. Three per workspace on Free, so a Free
//   user with two workspaces may connect three accounts in each.
//
//   POOLED across every workspace the user owns — posts, DM sends, X posts,
//   video minutes, research credits. One budget for the account, spent from
//   whichever workspace they like. This is what "a pool they can pull from"
//   means, and it is why the usage queries filter by user_id, not workspace_id.
export interface PlanLimits {
  /** Pooled. null = unlimited. Free is 2/day. */
  postsPerDay: number | null;
  /** Per workspace. null = unlimited. Free is 3. */
  maxConnectedAccountsPerWorkspace: number | null;
  /** Workspaces the user may own. null = unlimited. Free 2, Pro 5, Studio 10. */
  maxWorkspaces: number | null;
  /** null = every platform. Free excludes X, LinkedIn, Pinterest — the UI shows
   *  those as toggles with an upgrade badge, never hidden. */
  platforms: Platform[] | null;
  /** Pooled. 0 = X unavailable. Never null: X is the one platform that bills
   *  per post ($0.015, $0.20 with a link), so it is never unlimited. */
  xPostsPerMonth: number;
  /** False on every plan today — the 13x cost control. */
  xLinksAllowed: boolean;
  /** Pooled. null = unlimited. */
  dmRulesMax: number | null;
  /** Pooled. Meta rate-limits per app, not per user, so this is a shared budget
   *  in the literal sense: free users spend the allowance paying ones need. */
  dmSendsPerMonth: number;
  /** Pooled. */
  videoUploadMinutesPerMonth: number;
  funnels: boolean;
  /** Pooled. Studio's AI credits, spendable from any workspace. */
  researchCreditsPerMonth: number;
}

export interface EntitlementSnapshot {
  planId: string;
  limits: PlanLimits;
  usage: {
    /** Pooled. usage kind 'post_publish', trailing 24 hours — trailing rather
     *  than calendar-day so the cap cannot be doubled around midnight. */
    postsToday: number;
    /** Pooled. usage kind 'x_post', current UTC calendar month. */
    xPostsThisMonth: number;
    /** Pooled. usage kind 'dm_send', current UTC calendar month. */
    dmSendsThisMonth: number;
    /** Pooled. count(dm_rules) across every workspace the user owns. */
    dmRuleCount: number;
    /** Pooled. usage kind 'video_upload' amounts summed, current UTC month. */
    videoMinutesThisMonth: number;
    /** PER WORKSPACE — connections in the workspace being acted in. */
    connectedAccountsInWorkspace: number;
    /** count(workspaces) the user owns. */
    workspaceCount: number;
  };
}

export type Action =
  | { type: "publish_post"; platform: Platform; hasExternalLink?: boolean }
  | { type: "connect_platform"; platform: Platform }
  | { type: "create_workspace" }
  | { type: "create_dm_rule" }
  | { type: "send_dm" }
  | { type: "upload_video"; minutes: number }
  | { type: "use_funnels" };

export type DenialCode =
  | "plan_platform_locked"
  | "connected_accounts_cap"
  | "workspace_cap"
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
    maxConnectedAccountsPerWorkspace: nullableNumber(
      "max_connected_accounts_per_workspace",
    ),
    maxWorkspaces: nullableNumber("max_workspaces"),
    platforms,
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
