// Turning a Stripe event into an entitlement change.
//
// Pure orchestration over an injected store, like publishPost and the DM
// engine, because every rule here is a rule about money and access:
//
//   - Failed payment DOWNGRADES access (status past_due → the snapshot builder
//     already treats any non-active status as Free). It never locks the user
//     out and it never leaves them on paid limits for free.
//   - Events arrive at least once and out of order. Replays are deduped by
//     Stripe's own event id; an event older than the row's last applied one is
//     ignored rather than allowed to roll a subscription backwards.
//   - An event we do not recognise is recorded and marked ignored — visible,
//     never an error, because Stripe adds event types without asking us.

export interface StripeEventEnvelope {
  id: string;
  type: string;
  created: number;
  data: { object: Record<string, unknown> };
}

/** Statuses our schema accepts. Stripe has more (incomplete_expired, unpaid,
 *  paused); they map onto the nearest of ours, erring toward LESS access. */
export function mapStripeStatus(
  status: string,
): "active" | "trialing" | "past_due" | "canceled" | "incomplete" {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
    case "unpaid":
    case "paused":
      return "canceled";
    case "incomplete":
      return "incomplete";
    default:
      // Unknown status = no paid access. The safe wrong answer.
      return "canceled";
  }
}

export interface SubscriptionUpdate {
  userId: string;
  planId: string;
  status: ReturnType<typeof mapStripeStatus>;
  processorCustomerId: string | null;
  processorSubscriptionId: string | null;
  billingInterval: "monthly" | "annual" | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  eventAt: Date;
}

export interface BillingStore {
  /** True if this event id was stored now; false if it was already there —
   *  the replay dedupe, same pattern as webhook_events. */
  recordEvent(event: {
    id: string;
    type: string;
    customerId: string | null;
    subscriptionId: string | null;
    payload: unknown;
  }): Promise<boolean>;
  markEvent(
    id: string,
    status: "processed" | "ignored" | "failed",
    error?: string,
  ): Promise<void>;
  /** Resolve a Stripe customer to our user. Null = we do not know them. */
  userIdForCustomer(customerId: string): Promise<string | null>;
  /** Apply the update — but ONLY if eventAt is not older than the row's
   *  last_event_at. Returns false when skipped as stale. */
  applySubscription(update: SubscriptionUpdate): Promise<boolean>;
  /** Is this plan id one of ours? A typo'd metadata plan must not grant
   *  anything. */
  planExists(planId: string): Promise<boolean>;
}

export interface ProcessResult {
  outcome: "processed" | "duplicate" | "ignored" | "stale" | "failed";
  detail?: string;
}

/** The event types that move entitlements. Everything else is ignored. */
const SUBSCRIPTION_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

function str(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function epochToDate(value: unknown): Date | null {
  const n = num(value);
  return n === null ? null : new Date(n * 1000);
}

export async function processBillingEvent(
  store: BillingStore,
  event: StripeEventEnvelope,
): Promise<ProcessResult> {
  const object = event.data.object;
  const customerId = str(object.customer) ?? (event.type.startsWith("customer.") ? str(object.id) : null);
  const subscriptionId =
    event.type.startsWith("customer.subscription.") ? str(object.id) : str(object.subscription);

  const fresh = await store.recordEvent({
    id: event.id,
    type: event.type,
    customerId,
    subscriptionId,
    payload: object,
  });
  if (!fresh) return { outcome: "duplicate" };

  try {
    if (!SUBSCRIPTION_EVENTS.has(event.type)) {
      // checkout.session.completed, invoice.*, and everything else: the
      // subscription events carry the full truth, so acting on the others
      // would only double-apply it. Recorded for the audit trail, no more.
      await store.markEvent(event.id, "ignored");
      return { outcome: "ignored", detail: event.type };
    }

    const metadata = (object.metadata ?? {}) as Record<string, unknown>;
    const planId = str(metadata.plan_id);
    let userId = str(metadata.user_id);

    if (!userId && customerId) {
      userId = await store.userIdForCustomer(customerId);
    }
    if (!userId) {
      // A subscription we cannot attribute is a real problem worth a human's
      // attention — failed, not ignored, so it shows up.
      await store.markEvent(event.id, "failed", "no user_id in metadata and customer unknown");
      return { outcome: "failed", detail: "unattributable subscription" };
    }

    const stripeStatus = str(object.status) ?? "canceled";
    const status = mapStripeStatus(
      event.type === "customer.subscription.deleted" ? "canceled" : stripeStatus,
    );

    // The plan comes from metadata, stamped at checkout. If it is missing or
    // not one of ours, the user keeps access ONLY if the subscription is not
    // active anyway; an active subscription on an unknown plan is failed
    // loudly rather than guessed at.
    let effectivePlan = planId;
    if (!effectivePlan || !(await store.planExists(effectivePlan))) {
      if (status === "active" || status === "trialing") {
        await store.markEvent(event.id, "failed", `unknown plan "${planId}" on an active subscription`);
        return { outcome: "failed", detail: "unknown plan" };
      }
      // A dying subscription with bad metadata still needs its status applied
      // (that is the downgrade); the plan id on the row keeps its old value
      // meaningless once status is non-active, so "free" is fine.
      effectivePlan = "free";
    }

    const interval = ((): "monthly" | "annual" | null => {
      const fromMetadata = str(metadata.interval);
      if (fromMetadata === "monthly" || fromMetadata === "annual") return fromMetadata;
      const items = object.items as
        | { data?: { price?: { recurring?: { interval?: string } } }[] }
        | undefined;
      const recurring = items?.data?.[0]?.price?.recurring?.interval;
      if (recurring === "month") return "monthly";
      if (recurring === "year") return "annual";
      return null;
    })();

    const applied = await store.applySubscription({
      userId,
      planId: effectivePlan,
      status,
      processorCustomerId: customerId,
      processorSubscriptionId: subscriptionId,
      billingInterval: interval,
      currentPeriodStart: epochToDate(object.current_period_start),
      currentPeriodEnd: epochToDate(object.current_period_end),
      cancelAtPeriodEnd: object.cancel_at_period_end === true,
      eventAt: new Date(event.created * 1000),
    });

    if (!applied) {
      await store.markEvent(event.id, "ignored", "stale: a newer event was already applied");
      return { outcome: "stale" };
    }

    await store.markEvent(event.id, "processed");
    return { outcome: "processed" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await store
      .markEvent(event.id, "failed", message.slice(0, 500))
      .catch(() => {});
    return { outcome: "failed", detail: message };
  }
}
