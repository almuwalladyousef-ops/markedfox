import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceRoleClient } from "@/lib/supabase/service";

import {
  RATE_LIMITS,
  rateLimitKey,
  type RateLimitName,
} from "./policy";

// Enforcement. The counter is a Postgres row and the increment-and-check is a
// single atomic function call (see 20260831000000_rate_limits.sql), so two
// requests arriving together cannot both be told yes for the last slot.
//
// Service role on purpose: this table is app infrastructure with no RLS
// policies, and the whole point is that the caller being limited cannot reach
// it. It is also why every key is built by rateLimitKey() rather than
// interpolated at the call site — the key is the only user-controlled part.

export type RateLimitVerdict = {
  allowed: boolean;
  /** Seconds until the window turns over. 0 when allowed. */
  retryAfterSeconds: number;
  /** Attempts left in this window. */
  remaining: number;
  /** The policy's own wording, ready to show. Null when allowed. */
  message: string | null;
};

const ALLOWED: RateLimitVerdict = {
  allowed: true,
  retryAfterSeconds: 0,
  remaining: Number.POSITIVE_INFINITY,
  message: null,
};

/**
 * Spend one attempt against a policy.
 *
 * **Fails open.** If the database cannot answer, the caller is allowed
 * through and the failure is logged. That is the deliberate trade: this
 * limiter protects against abuse, and a limiter that fails closed converts a
 * database blip into "nobody in the world can sign in", which is a worse
 * outage than the abuse it prevents. The data itself is never protected by
 * this function — RLS is, and RLS fails closed.
 */
export async function consumeRateLimit(
  name: RateLimitName,
  subject: string | null | undefined,
  client?: SupabaseClient,
): Promise<RateLimitVerdict> {
  // No subject means nothing to count against — an unidentifiable caller is
  // handled by the other keys on the same action, not by a shared bucket.
  if (!subject) return ALLOWED;

  const policy = RATE_LIMITS[name];

  try {
    // Inside the try on purpose: createServiceRoleClient() calls requireEnv,
    // which THROWS on a deployment missing SUPABASE_SECRET_KEY. Built outside,
    // that throw would escape a limiter documented to fail open and turn a
    // misconfiguration into "nobody in the world can sign in".
    const service = client ?? createServiceRoleClient();

    const { data, error } = await service.rpc("consume_rate_limit", {
      p_key: rateLimitKey(name, subject),
      p_limit: policy.limit,
      p_window_seconds: policy.windowSeconds,
      p_cost: 1,
    });

    if (error) {
      console.error(`rate limit: ${name} could not be checked`, error.message);
      return ALLOWED;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row.allowed !== "boolean") return ALLOWED;

    return {
      allowed: row.allowed,
      retryAfterSeconds: Number(row.retry_after_seconds ?? 0),
      remaining: Number(row.remaining ?? 0),
      message: row.allowed ? null : policy.message,
    };
  } catch (err) {
    console.error(
      `rate limit: ${name} could not be checked`,
      err instanceof Error ? err.message : String(err),
    );
    return ALLOWED;
  }
}

/**
 * Check several policies for one action and return the first refusal.
 *
 * Every policy is consumed even when an earlier one refuses. That is on
 * purpose: if the per-IP limit stopped counting the moment a per-email limit
 * tripped, an attacker could hold one email at its ceiling and spend the rest
 * of the window guessing other addresses for free.
 */
export async function consumeAll(
  checks: { name: RateLimitName; subject: string | null | undefined }[],
  client?: SupabaseClient,
): Promise<RateLimitVerdict> {
  let service: SupabaseClient | undefined;
  try {
    service = client ?? createServiceRoleClient();
  } catch {
    // consumeRateLimit logs and fails open per policy; let it do that once
    // per check rather than duplicating the message here.
    service = undefined;
  }

  const verdicts = await Promise.all(
    checks.map((check) => consumeRateLimit(check.name, check.subject, service)),
  );
  return verdicts.find((verdict) => !verdict.allowed) ?? ALLOWED;
}

/**
 * Forget a key. Called after a successful sign-in: a correct password proves
 * the caller was not guessing, and leaving two-thirds of a lockout on somebody
 * who simply fumbled their password is a bad experience with no security gain.
 */
export async function resetRateLimit(
  name: RateLimitName,
  subject: string | null | undefined,
  client?: SupabaseClient,
): Promise<void> {
  if (!subject) return;
  try {
    const service = client ?? createServiceRoleClient();
    const { error } = await service.rpc("reset_rate_limit", {
      p_key: rateLimitKey(name, subject),
    });
    if (error) console.error(`rate limit: could not reset ${name}`, error.message);
  } catch (err) {
    // Never fatal: failing to forgive a counter must not fail the sign-in
    // that earned the forgiveness.
    console.error(
      `rate limit: could not reset ${name}`,
      err instanceof Error ? err.message : String(err),
    );
  }
}
