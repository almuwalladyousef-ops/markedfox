// The shared platform rate-limit budget.
//
// Meta and TikTok rate-limit PER APP, not per user. Every customer — free users
// included — spends from one allowance that belongs to MarkedFox, so a launch
// burst of a hundred people posting in the same hour can throttle the whole
// product, and the failure lands on everyone including the people who did
// nothing. Backing off before the platform does is the only version of that
// which is survivable.
//
// Two things live here: the per-platform limits (plain data, so raising one is
// a constant, not a refactor) and the pure decision logic for what a caller
// does when refused. The atomic accounting is a Postgres function, because two
// workers must never both be told yes for the last call in a window.

import type { Platform } from "./types";

export interface PlatformBudgetLimit {
  /** Calls allowed inside one window. */
  readonly calls: number;
  /** Window length in seconds. */
  readonly windowSeconds: number;
  /** Why this number, so the next person to change it knows what they are
   *  trading away. */
  readonly rationale: string;
}

const HOUR = 3600;

/**
 * Deliberately BELOW each platform's published ceiling. The budget's job is to
 * stop us reaching the platform's limit, so a budget set at the limit would be
 * useless — we would only ever discover it by being throttled.
 */
export const PLATFORM_BUDGETS: Partial<Record<Platform, PlatformBudgetLimit>> = {
  instagram: {
    // Meta's Instagram content publishing allows 100 posts per account per 24h,
    // and the app-level Graph limit is computed from active users. At a hundred
    // users the app-level ceiling is what binds first, so this is a floor we
    // stay comfortably under and raise once real numbers exist.
    calls: 200,
    windowSeconds: HOUR,
    rationale:
      "Meta's app-level Graph limit scales with active users; at launch scale the app ceiling binds before any per-account one.",
  },
  facebook: {
    calls: 200,
    windowSeconds: HOUR,
    rationale: "Same Meta app-level budget as Instagram — they share it.",
  },
  threads: {
    calls: 200,
    windowSeconds: HOUR,
    rationale: "Threads publishing counts against the same Meta app budget.",
  },
  tiktok: {
    // TikTok's Content Posting API is rate-limited per client key, and an
    // unaudited client is limited far harder still.
    calls: 100,
    windowSeconds: HOUR,
    rationale:
      "TikTok limits per client key, and an unaudited client far harder — this stays well inside both.",
  },
  youtube: {
    // The Data API's 10,000 units/day is the real constraint, and an upload
    // costs 1,600 of them: six uploads a day exhausts the default quota.
    calls: 6,
    windowSeconds: 24 * HOUR,
    rationale:
      "A videos.insert costs 1,600 of the 10,000 daily quota units, so six uploads a day is the whole default quota.",
  },
  snapchat: {
    calls: 100,
    windowSeconds: HOUR,
    rationale: "Conservative until real numbers exist.",
  },
  // X is deliberately absent: it is pay-per-use with no rate limit worth
  // budgeting, and its spending control is the plan's monthly post cap plus the
  // server-side link guard, both of which already exist.
};

export function budgetFor(platform: Platform): PlatformBudgetLimit | null {
  return PLATFORM_BUDGETS[platform] ?? null;
}

export interface BudgetDecision {
  allowed: boolean;
  /** Seconds until it is worth asking again. 0 when allowed. */
  retryAfterSeconds: number;
}

export class PlatformBudgetError extends Error {
  constructor(
    readonly platform: Platform,
    readonly retryAfterSeconds: number,
  ) {
    super(
      `${platform} is at its shared rate-limit budget; retrying in about ${retryAfterSeconds}s`,
    );
    this.name = "PlatformBudgetError";
  }
}

/** What the store must provide. Injected so the decision logic tests without
 *  Postgres, the same pattern as the rest of the codebase. */
export interface BudgetStore {
  consume(
    platform: Platform,
    cost: number,
    limit: PlatformBudgetLimit,
  ): Promise<BudgetDecision>;
  throttle(
    platform: Platform,
    retryAfterSeconds: number,
    error?: string,
  ): Promise<void>;
}

/**
 * Ask for permission to call a platform. A platform with no configured budget
 * is always allowed — absence means "not metered", not "blocked".
 */
export async function requestBudget(
  store: BudgetStore,
  platform: Platform,
  cost = 1,
): Promise<BudgetDecision> {
  const limit = budgetFor(platform);
  if (!limit) return { allowed: true, retryAfterSeconds: 0 };
  return store.consume(platform, cost, limit);
}

/** The throwing form, for call sites that cannot proceed without permission. */
export async function requireBudget(
  store: BudgetStore,
  platform: Platform,
  cost = 1,
): Promise<void> {
  const decision = await requestBudget(store, platform, cost);
  if (!decision.allowed) {
    throw new PlatformBudgetError(platform, decision.retryAfterSeconds);
  }
}

/** Platforms answer 429 in their own dialects. Anything above this is treated
 *  as a mistake rather than a genuine hour-long block. */
export const MAX_RETRY_AFTER_SECONDS = 3600;
export const DEFAULT_RETRY_AFTER_SECONDS = 300;

/**
 * Read a platform's Retry-After. Accepts the seconds form and the HTTP-date
 * form, clamps the result, and falls back to a conservative default — a
 * platform that says "stop" without saying how long means a real pause, not a
 * quick retry.
 */
export function parseRetryAfter(
  header: string | null | undefined,
  now: Date = new Date(),
): number {
  if (!header) return DEFAULT_RETRY_AFTER_SECONDS;

  const seconds = Number(header.trim());
  if (Number.isFinite(seconds) && seconds >= 0) {
    return clamp(Math.ceil(seconds));
  }

  const date = Date.parse(header);
  if (!Number.isNaN(date)) {
    return clamp(Math.ceil((date - now.getTime()) / 1000));
  }

  return DEFAULT_RETRY_AFTER_SECONDS;
}

function clamp(seconds: number): number {
  if (seconds < 1) return 1;
  return Math.min(seconds, MAX_RETRY_AFTER_SECONDS);
}

/** Recognise a rate-limit refusal across the platforms' different shapes. */
export function isRateLimited(status: number, body?: string): boolean {
  if (status === 429) return true;
  if (!body) return false;
  // Meta reports throttling as codes 4, 17, 32, 613 inside a 400 — a plain
  // status check would miss every one of them.
  return /\b(rate limit|too many requests|request limit reached|calls to this api have exceeded the rate limit)\b/i.test(
    body,
  );
}
