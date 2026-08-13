import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { parsePlanLimits, type EntitlementSnapshot } from "./types";

// The only I/O in the entitlement path: everything else is pure and testable
// without a database.
//
// Windows are deliberate and documented here, not in the pure function:
// - posts per week = trailing 7 days
// - monthly caps = current UTC calendar month
// Phase 6 may realign monthly windows to the billing period; that is a change
// to this builder only — canUserDo never changes.

const FALLBACK_PLAN_ID = "free";
const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export async function getEntitlementSnapshot(
  supabase: SupabaseClient,
  userId: string,
  workspaceId: string,
): Promise<EntitlementSnapshot> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );

  const { data: subscription, error: subscriptionError } = await supabase
    .from("subscriptions")
    .select("status, plan_id, plans (limits)")
    .eq("user_id", userId)
    .maybeSingle();
  if (subscriptionError) throw subscriptionError;

  // A missing subscription row or a non-active status degrades to Free:
  // billing failure means Free limits, never a hard lockout and never a free
  // upgrade.
  let planId: string;
  let limitsJson: unknown;
  // Without generated DB types the client cannot tell this is a to-one join;
  // PostgREST returns a single object, the inferred type says array. Accept
  // both. Phase 2 replaces this with `supabase gen types typescript`.
  const rawPlans: unknown = subscription?.plans;
  const planRelation = (
    Array.isArray(rawPlans) ? (rawPlans[0] ?? null) : (rawPlans ?? null)
  ) as { limits: unknown } | null;
  if (
    subscription &&
    ACTIVE_STATUSES.has(subscription.status) &&
    planRelation
  ) {
    planId = subscription.plan_id;
    limitsJson = planRelation.limits;
  } else {
    planId = FALLBACK_PLAN_ID;
    const { data: freePlan, error: freePlanError } = await supabase
      .from("plans")
      .select("limits")
      .eq("id", FALLBACK_PLAN_ID)
      .single();
    if (freePlanError) throw freePlanError;
    limitsJson = freePlan.limits;
  }

  const [posts, xPosts, dmSends, videoMinutes, dmRules] = await Promise.all([
    countUsage(supabase, userId, "post_publish", weekAgo),
    countUsage(supabase, userId, "x_post", monthStart),
    countUsage(supabase, userId, "dm_send", monthStart),
    sumUsage(supabase, userId, "video_upload", monthStart),
    countDmRules(supabase, workspaceId),
  ]);

  return {
    planId,
    limits: parsePlanLimits(limitsJson),
    usage: {
      postsThisWeek: posts,
      xPostsThisMonth: xPosts,
      dmSendsThisMonth: dmSends,
      videoMinutesThisMonth: videoMinutes,
      dmRuleCount: dmRules,
    },
  };
}

async function countUsage(
  supabase: SupabaseClient,
  userId: string,
  kind: string,
  since: Date,
): Promise<number> {
  const { count, error } = await supabase
    .from("usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", kind)
    .gte("occurred_at", since.toISOString());
  if (error) throw error;
  return count ?? 0;
}

async function sumUsage(
  supabase: SupabaseClient,
  userId: string,
  kind: string,
  since: Date,
): Promise<number> {
  const { data, error } = await supabase
    .from("usage")
    .select("amount")
    .eq("user_id", userId)
    .eq("kind", kind)
    .gte("occurred_at", since.toISOString());
  if (error) throw error;
  return (data ?? []).reduce((total, row) => total + Number(row.amount), 0);
}

async function countDmRules(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("dm_rules")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);
  if (error) throw error;
  return count ?? 0;
}
