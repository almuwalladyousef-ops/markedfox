import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  BudgetDecision,
  BudgetStore,
  PlatformBudgetLimit,
} from "./budget";
import type { Platform } from "./types";

// The Postgres side of the shared platform budget. The accounting itself is a
// SECURITY DEFINER function so the increment-and-check is one atomic step: two
// workers must never both be told yes for the last call in a window.

export function createBudgetStore(supabase: SupabaseClient): BudgetStore {
  return {
    async consume(
      platform: Platform,
      cost: number,
      limit: PlatformBudgetLimit,
    ): Promise<BudgetDecision> {
      const { data, error } = await supabase.rpc("consume_platform_budget", {
        p_platform: platform,
        p_cost: cost,
        p_limit: limit.calls,
        p_window_seconds: limit.windowSeconds,
      });
      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      return {
        allowed: Boolean(row?.allowed),
        retryAfterSeconds: Number(row?.retry_after_seconds ?? 0),
      };
    },

    async throttle(
      platform: Platform,
      retryAfterSeconds: number,
      errorText?: string,
    ): Promise<void> {
      const { error } = await supabase.rpc("record_platform_throttle", {
        p_platform: platform,
        p_retry_after_seconds: retryAfterSeconds,
        p_error: errorText ?? null,
      });
      if (error) throw error;
    },
  };
}

/**
 * A store that always allows and records nothing. Used where a budget check
 * would be wrong rather than merely unavailable — a user pressing "post now"
 * and watching the screen should get the platform's own answer, not ours.
 */
export const unmeteredBudgetStore: BudgetStore = {
  async consume(): Promise<BudgetDecision> {
    return { allowed: true, retryAfterSeconds: 0 };
  },
  async throttle(): Promise<void> {},
};
