import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

// Reserving a research credit before spending it.
//
// Every research feature that calls a model follows the same three steps, and
// getting them in this order is the whole point:
//
//   1. reserve — atomic, so two tabs cannot both pass the same cap
//   2. call the model
//   3. release on failure, so "no credit was used" stays true
//
// The reservation IS the usage row. There is no pending state and no refund
// flag: a usage row means a credit was spent, everywhere in the codebase, and
// giving it a second meaning would be worse than the race it replaced.

export interface CreditReservation {
  usageId: number;
}

/** Null when the plan's monthly allowance is already spent. */
export async function reserveResearchCredit(
  supabase: SupabaseClient,
  input: {
    userId: string;
    workspaceId: string;
    monthlyLimit: number;
    refId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<CreditReservation | null> {
  const { data, error } = await supabase.rpc("reserve_research_credit", {
    p_user_id: input.userId,
    p_workspace_id: input.workspaceId,
    p_limit: input.monthlyLimit,
    p_ref_id: input.refId ?? null,
    p_metadata: input.metadata ?? {},
  });
  if (error) throw error;
  return data === null || data === undefined
    ? null
    : { usageId: Number(data) };
}

/**
 * Hand a reservation back.
 *
 * Best-effort on purpose: this runs in the failure path of a model call, and
 * throwing here would replace a clear "that failed" with a confusing second
 * error about bookkeeping. The worst case is one credit the user did not get
 * the benefit of, which is the same as it was before reservations existed.
 */
export async function releaseResearchCredit(
  supabase: SupabaseClient,
  userId: string,
  reservation: CreditReservation | null,
): Promise<void> {
  if (!reservation) return;
  const { error } = await supabase.rpc("release_research_credit", {
    p_user_id: userId,
    p_usage_id: reservation.usageId,
  });
  if (error) console.error("research credits: could not release", error);
}

/**
 * Stamp the reservation with what it turned out to be for.
 *
 * A separate call because the model's name is only known after it answers, and
 * `usage` has no update policy for authenticated users — that is on purpose, so
 * caps cannot be edited away — hence the security-definer route.
 *
 * Best-effort: the credit is already counted correctly, and only the note about
 * which model answered would be missing.
 */
export async function annotateResearchCredit(
  supabase: SupabaseClient,
  userId: string,
  reservation: CreditReservation,
  metadata: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.rpc("annotate_research_credit", {
    p_user_id: userId,
    p_usage_id: reservation.usageId,
    p_metadata: metadata,
  });
  if (error) console.error("research credits: could not annotate", error);
}
