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
  /**
   * May this plan schedule a post for later, or only publish now and save
   * drafts? Free is false (owner decision, 2026-08-25).
   *
   * It is the one gate here that costs us something real per use rather than
   * per plan: a scheduled post's media is uploaded when the button is pressed
   * and then sits in the bucket until the tick fires, so a free account can
   * park storage for a fortnight at a time. Posting now spends it in minutes.
   */
  scheduling: boolean;
  /**
   * How much of an unfinished post this plan may keep.
   *
   *   "none"  nothing is stored (Free)
   *   "text"  a caption, but not the media it would carry (Starter)
   *   "any"   the whole draft (Pro and above)
   *
   * Same reasoning as `scheduling`, and the same real cost: a draft's media
   * sits in the bucket until the post goes out or the draft is thrown away,
   * and "until" has no upper bound. A caption is a few hundred bytes, so the
   * middle rung is free to give and is the one people actually want — writing
   * ahead is not the expensive half.
   */
  drafts: "none" | "text" | "any";
  funnels: boolean;
  /** Pooled. Studio's AI credits, spendable from any workspace. */
  researchCreditsPerMonth: number;
  /** Pooled. Channels the account may track at once. Every tracked channel is
   *  API quota spent on a schedule, so unlimited tracking is unlimited spend —
   *  which is why this is a number on every plan and null only on Enterprise. */
  researchSourcesMax: number | null;
  /** How often a tracked channel is refreshed. Higher tiers see moves sooner;
   *  the cost is proportional, which is what makes it a tier difference. */
  researchRefreshHours: number;
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
    /** Pooled. count(research_sources) across every workspace the user owns. */
    researchSourceCount: number;
    /** Pooled. usage kind 'video_upload' amounts summed, current UTC month. */
    videoMinutesThisMonth: number;
    /** Pooled. usage kind 'ai_call' amounts summed, current UTC month. One
     *  credit is one AI generation; research is the only spender today. */
    researchCreditsThisMonth: number;
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
  /** Setting a time on a post rather than publishing it now. */
  | { type: "schedule_post" }
  /** Keeping an unfinished post. `hasMedia` is the whole question on Starter,
   *  which may keep the words and not the video. */
  | { type: "save_draft"; hasMedia: boolean }
  | { type: "use_funnels" }
  /** Watching channels and reading the outlier feed. Gated on the plan having
   *  any research allowance at all, so Free and Pro see the upgrade prompt. */
  | { type: "use_research" }
  | { type: "track_research_source" }
  /** One AI generation (hooks, script, outline). Checked BEFORE the call, so
   *  a denial costs nothing upstream. */
  | { type: "spend_research_credits"; credits: number };

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
  | "scheduling_locked"
  | "drafts_locked"
  | "media_drafts_locked"
  /** Not a plan limit — a scheduled post holds its media in storage until it
   *  goes out, and past a point that stops being transient. */
  | "scheduled_media_too_large"
  | "funnels_locked"
  | "research_locked"
  | "research_credits_cap"
  | "research_sources_cap";

export type Decision =
  | { allowed: true }
  | { allowed: false; code: DenialCode; reason: string };

/** A monthly cap at or above this is "no limit". A few caps cannot be null
 *  (parsePlanLimits requires a number), so the owner plan sets them here
 *  instead; screens show such a cap as unlimited rather than printing it. */
export const UNREACHABLE_CAP = 1_000_000_000;

/** The cap to show on screen: null when it can never be reached. */
export function shownCap(cap: number): number | null {
  return cap >= UNREACHABLE_CAP ? null : cap;
}

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
  const optionalBoolean = (field: string, fallback: boolean): boolean => {
    const v = o[field];
    if (v === undefined || v === null) return fallback;
    if (typeof v === "boolean") return v;
    throw new PlanLimitsParseError(`limits.${field} must be a boolean`);
  };

  const draftsLevel = (value: unknown): PlanLimits["drafts"] => {
    if (value === undefined || value === null) return "any";
    if (value === "none" || value === "text" || value === "any") return value;
    throw new PlanLimitsParseError(
      'limits.drafts must be "none", "text" or "any"',
    );
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
    // Optional, and true when absent, unlike every other field here.
    //
    // The migration that adds `scheduling` to plans.limits runs before the
    // code that reads it, so in practice it is always there. If it somehow is
    // not, the safe wrong answer is the generous one: a missing key must not
    // quietly take scheduling away from someone paying for it. Free says
    // false explicitly.
    scheduling: optionalBoolean("scheduling", true),
    // Optional, and "any" when absent, for the same reason `scheduling`
    // defaults to true: the migration that adds this key runs before the code
    // that reads it, and a key that has not landed yet must not quietly take
    // drafts away from somebody paying for them. Free says "none" explicitly.
    drafts: draftsLevel(o["drafts"]),
    funnels: requiredBoolean("funnels"),
    researchCreditsPerMonth: requiredNumber("research_credits_per_month"),
    researchSourcesMax: nullableNumber("research_sources_max"),
    researchRefreshHours: requiredNumber("research_refresh_hours"),
  };
}
