import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { BillingStore, SubscriptionUpdate } from "./events";

// The Supabase side of billing. Always the service-role client: these rows are
// written by webhooks with no user session, and RLS deliberately has no
// policies on billing_events (another tenant's customer ids and amounts).

export function createBillingStore(service: SupabaseClient): BillingStore {
  return {
    async recordEvent(event): Promise<boolean> {
      // Stripe's own event id is the primary key: a replay violates it, and
      // ignoreDuplicates turns that violation into "no row inserted", which is
      // exactly the signal the processor wants.
      const { data, error } = await service
        .from("billing_events")
        .upsert(
          {
            id: event.id,
            type: event.type,
            processor_customer_id: event.customerId,
            processor_subscription_id: event.subscriptionId,
            payload: event.payload,
          },
          { onConflict: "id", ignoreDuplicates: true },
        )
        .select("id");
      if (error) throw error;
      return (data ?? []).length > 0;
    },

    async markEvent(id, status, errorText): Promise<void> {
      const { error } = await service
        .from("billing_events")
        .update({
          status,
          last_error: errorText ?? null,
          processed_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },

    async userIdForCustomer(customerId): Promise<string | null> {
      const { data, error } = await service
        .from("subscriptions")
        .select("user_id")
        .eq("processor_customer_id", customerId)
        .maybeSingle();
      if (error) throw error;
      return (data as { user_id: string } | null)?.user_id ?? null;
    },

    async applySubscription(update: SubscriptionUpdate): Promise<boolean> {
      // The staleness gate. Two events racing (or replayed out of order) must
      // not roll a subscription backwards, so the update only lands when this
      // event is not older than the last one applied. The filter does it
      // atomically — no read-then-write window.
      const { data, error } = await service
        .from("subscriptions")
        .update({
          plan_id: update.planId,
          status: update.status,
          processor: "stripe",
          processor_customer_id: update.processorCustomerId,
          processor_subscription_id: update.processorSubscriptionId,
          billing_interval: update.billingInterval,
          current_period_start: update.currentPeriodStart?.toISOString() ?? null,
          current_period_end: update.currentPeriodEnd?.toISOString() ?? null,
          cancel_at_period_end: update.cancelAtPeriodEnd,
          last_event_at: update.eventAt.toISOString(),
        })
        .eq("user_id", update.userId)
        .or(`last_event_at.is.null,last_event_at.lte.${update.eventAt.toISOString()}`)
        .select("user_id");
      if (error) throw error;
      return (data ?? []).length > 0;
    },

    async planExists(planId): Promise<boolean> {
      const { data, error } = await service
        .from("plans")
        .select("id")
        .eq("id", planId)
        .maybeSingle();
      if (error) throw error;
      return data !== null;
    },
  };
}

// ── checkout helpers (user-scoped reads, service-role writes) ──────────────

export interface CheckoutPlan {
  id: string;
  name: string;
  priceMonthly: string | null;
  priceAnnual: string | null;
}

/** The plans a user can actually check out: public, priced, and mapped to a
 *  Stripe price for the asked interval. */
export async function getCheckoutPlan(
  supabase: SupabaseClient,
  planId: string,
): Promise<CheckoutPlan | null> {
  const { data, error } = await supabase
    .from("plans")
    .select("id, name, is_public, stripe_price_monthly, stripe_price_annual")
    .eq("id", planId)
    .maybeSingle();
  if (error) throw error;
  if (!data || !(data as { is_public: boolean }).is_public) return null;
  const row = data as {
    id: string;
    name: string;
    stripe_price_monthly: string | null;
    stripe_price_annual: string | null;
  };
  return {
    id: row.id,
    name: row.name,
    priceMonthly: row.stripe_price_monthly,
    priceAnnual: row.stripe_price_annual,
  };
}

export async function getStripeCustomerId(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("processor_customer_id, processor")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  const row = data as { processor_customer_id: string | null; processor: string } | null;
  // A customer id from another processor is not a Stripe customer id.
  return row?.processor === "stripe" ? row.processor_customer_id : null;
}

/** Store the customer id the moment it is created, BEFORE checkout completes —
 *  so the webhook can attribute events even if the user abandons the session
 *  and later subscribes from the Stripe-hosted page. Service role: the
 *  subscriptions table is deliberately not user-writable. */
export async function saveStripeCustomerId(
  service: SupabaseClient,
  userId: string,
  customerId: string,
): Promise<void> {
  const { error } = await service
    .from("subscriptions")
    .update({ processor: "stripe", processor_customer_id: customerId })
    .eq("user_id", userId);
  if (error) throw error;
}
