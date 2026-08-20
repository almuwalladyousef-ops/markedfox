import { describe, expect, it, vi } from "vitest";

import {
  budgetFor,
  DEFAULT_RETRY_AFTER_SECONDS,
  isRateLimited,
  MAX_RETRY_AFTER_SECONDS,
  parseRetryAfter,
  PLATFORM_BUDGETS,
  PlatformBudgetError,
  requestBudget,
  requireBudget,
  type BudgetDecision,
  type BudgetStore,
} from "./budget";
import { listRegisteredPlatforms } from "./registry";

function store(decision: BudgetDecision): BudgetStore {
  return {
    consume: vi.fn(async () => decision),
    throttle: vi.fn(async () => {}),
  };
}

describe("the budget table", () => {
  it("covers every Meta platform, which share one app-level allowance", () => {
    for (const platform of ["instagram", "facebook", "threads"] as const) {
      expect(budgetFor(platform)).not.toBeNull();
    }
  });

  it("leaves X unmetered — its control is the plan cap and the link guard", () => {
    // X is pay-per-use with no rate limit worth budgeting; adding one here
    // would refuse posts the user has already paid for.
    expect(budgetFor("x")).toBeNull();
  });

  it("gives YouTube a daily window, because its quota is daily", () => {
    const youtube = budgetFor("youtube");
    expect(youtube?.windowSeconds).toBe(24 * 3600);
    // videos.insert costs 1,600 of 10,000 units: six uploads is the whole day.
    expect(youtube?.calls).toBeLessThanOrEqual(6);
  });

  it("explains every limit, so the next person to change one knows the trade", () => {
    for (const limit of Object.values(PLATFORM_BUDGETS)) {
      expect(limit?.rationale.length ?? 0).toBeGreaterThan(20);
    }
  });

  it("only names platforms that actually exist", () => {
    const known = new Set(listRegisteredPlatforms().map((a) => a.id));
    for (const platform of Object.keys(PLATFORM_BUDGETS)) {
      expect(known.has(platform as never)).toBe(true);
    }
  });
});

describe("requestBudget", () => {
  it("allows a platform with no budget configured", async () => {
    const s = store({ allowed: false, retryAfterSeconds: 99 });
    // X has no budget, so the store is never even asked.
    const decision = await requestBudget(s, "x");
    expect(decision.allowed).toBe(true);
    expect(s.consume).not.toHaveBeenCalled();
  });

  it("asks the store for a metered platform", async () => {
    const s = store({ allowed: true, retryAfterSeconds: 0 });
    await requestBudget(s, "instagram", 3);
    expect(s.consume).toHaveBeenCalledWith(
      "instagram",
      3,
      budgetFor("instagram"),
    );
  });

  it("passes a refusal through with its retry hint", async () => {
    const decision = await requestBudget(
      store({ allowed: false, retryAfterSeconds: 42 }),
      "instagram",
    );
    expect(decision).toEqual({ allowed: false, retryAfterSeconds: 42 });
  });
});

describe("requireBudget", () => {
  it("throws with the retry hint when refused", async () => {
    await expect(
      requireBudget(store({ allowed: false, retryAfterSeconds: 30 }), "tiktok"),
    ).rejects.toBeInstanceOf(PlatformBudgetError);
  });

  it("is silent when allowed", async () => {
    await expect(
      requireBudget(store({ allowed: true, retryAfterSeconds: 0 }), "tiktok"),
    ).resolves.toBeUndefined();
  });
});

describe("parseRetryAfter", () => {
  const now = new Date("2026-08-19T12:00:00Z");

  it("reads the seconds form", () => {
    expect(parseRetryAfter("120", now)).toBe(120);
  });

  it("reads the HTTP-date form", () => {
    expect(parseRetryAfter("Wed, 19 Aug 2026 12:05:00 GMT", now)).toBe(300);
  });

  it("falls back to a conservative pause when the platform says nothing", () => {
    // A platform that says stop without saying how long means a real pause.
    expect(parseRetryAfter(null, now)).toBe(DEFAULT_RETRY_AFTER_SECONDS);
    expect(parseRetryAfter("nonsense", now)).toBe(DEFAULT_RETRY_AFTER_SECONDS);
  });

  it("clamps an absurd value rather than blocking for a day", () => {
    expect(parseRetryAfter("999999", now)).toBe(MAX_RETRY_AFTER_SECONDS);
  });

  it("never returns zero, which would be a hot retry loop", () => {
    expect(parseRetryAfter("0", now)).toBe(1);
    expect(parseRetryAfter("Wed, 19 Aug 2026 11:00:00 GMT", now)).toBe(1);
  });
});

describe("isRateLimited", () => {
  it("recognises a plain 429", () => {
    expect(isRateLimited(429)).toBe(true);
  });

  it("recognises Meta's throttling inside a 400, which a status check misses", () => {
    expect(
      isRateLimited(400, "(#4) Application request limit reached"),
    ).toBe(true);
    expect(
      isRateLimited(
        400,
        "Calls to this api have exceeded the rate limit",
      ),
    ).toBe(true);
  });

  it("does not mistake an ordinary failure for throttling", () => {
    expect(isRateLimited(400, "Invalid caption length")).toBe(false);
    expect(isRateLimited(500)).toBe(false);
  });
});
