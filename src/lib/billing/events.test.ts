import { describe, expect, it } from "vitest";

import {
  mapStripeStatus,
  processBillingEvent,
  type BillingStore,
  type StripeEventEnvelope,
  type SubscriptionUpdate,
} from "./events";

function memoryStore(overrides: Partial<BillingStore> = {}) {
  const seen = new Set<string>();
  const applied: SubscriptionUpdate[] = [];
  const marks: { id: string; status: string; error?: string }[] = [];
  const store: BillingStore = {
    async recordEvent(event) {
      if (seen.has(event.id)) return false;
      seen.add(event.id);
      return true;
    },
    async markEvent(id, status, error) {
      marks.push({ id, status, error });
    },
    async userIdForCustomer() {
      return null;
    },
    async applySubscription(update) {
      applied.push(update);
      return true;
    },
    async planExists(planId) {
      return ["free", "pro", "studio", "enterprise"].includes(planId);
    },
    ...overrides,
  };
  return { store, applied, marks };
}

function subscriptionEvent(
  overrides: Partial<{
    id: string;
    type: string;
    status: string;
    metadata: Record<string, string>;
    created: number;
  }> = {},
): StripeEventEnvelope {
  return {
    id: overrides.id ?? "evt_1",
    type: overrides.type ?? "customer.subscription.updated",
    created: overrides.created ?? 1_750_000_000,
    data: {
      object: {
        id: "sub_1",
        customer: "cus_1",
        status: overrides.status ?? "active",
        cancel_at_period_end: false,
        current_period_start: 1_750_000_000,
        current_period_end: 1_752_592_000,
        metadata: overrides.metadata ?? { user_id: "user-1", plan_id: "pro", interval: "monthly" },
        items: { data: [{ price: { id: "price_1", recurring: { interval: "month" } } }] },
      },
    },
  };
}

describe("mapStripeStatus", () => {
  it("maps the statuses our schema knows", () => {
    expect(mapStripeStatus("active")).toBe("active");
    expect(mapStripeStatus("trialing")).toBe("trialing");
    expect(mapStripeStatus("past_due")).toBe("past_due");
    expect(mapStripeStatus("canceled")).toBe("canceled");
    expect(mapStripeStatus("incomplete")).toBe("incomplete");
  });

  it("errs toward LESS access for anything unknown", () => {
    // A status we have never seen must not read as paid.
    expect(mapStripeStatus("paused")).toBe("canceled");
    expect(mapStripeStatus("unpaid")).toBe("canceled");
    expect(mapStripeStatus("some_future_status")).toBe("canceled");
  });
});

describe("processBillingEvent", () => {
  it("applies an active subscription to the right user and plan", async () => {
    const { store, applied } = memoryStore();
    const result = await processBillingEvent(store, subscriptionEvent());

    expect(result.outcome).toBe("processed");
    expect(applied).toHaveLength(1);
    expect(applied[0]).toMatchObject({
      userId: "user-1",
      planId: "pro",
      status: "active",
      billingInterval: "monthly",
      processorCustomerId: "cus_1",
      processorSubscriptionId: "sub_1",
    });
  });

  it("drops a replayed event without touching the subscription again", async () => {
    const { store, applied } = memoryStore();
    await processBillingEvent(store, subscriptionEvent());
    const replay = await processBillingEvent(store, subscriptionEvent());

    expect(replay.outcome).toBe("duplicate");
    expect(applied).toHaveLength(1);
  });

  it("failed payment downgrades access — past_due lands on the row", async () => {
    // The snapshot builder treats any non-active status as Free, so this IS
    // the "failed payment downgrades access" exit criterion.
    const { store, applied } = memoryStore();
    const result = await processBillingEvent(
      store,
      subscriptionEvent({ status: "past_due" }),
    );

    expect(result.outcome).toBe("processed");
    expect(applied[0].status).toBe("past_due");
  });

  it("a deleted subscription is canceled whatever its object status says", async () => {
    const { store, applied } = memoryStore();
    await processBillingEvent(
      store,
      subscriptionEvent({ type: "customer.subscription.deleted", status: "active" }),
    );
    expect(applied[0].status).toBe("canceled");
  });

  it("refuses to grant an active subscription on a plan that is not ours", async () => {
    const { store, applied, marks } = memoryStore();
    const result = await processBillingEvent(
      store,
      subscriptionEvent({ metadata: { user_id: "user-1", plan_id: "hackerplan" } }),
    );

    expect(result.outcome).toBe("failed");
    expect(applied).toHaveLength(0);
    expect(marks.find((m) => m.id === "evt_1")?.status).toBe("failed");
  });

  it("still applies the DOWNGRADE when a dying subscription has bad metadata", async () => {
    // The unknown plan must not block the removal of access.
    const { store, applied } = memoryStore();
    const result = await processBillingEvent(
      store,
      subscriptionEvent({
        type: "customer.subscription.deleted",
        metadata: { user_id: "user-1", plan_id: "hackerplan" },
      }),
    );
    expect(result.outcome).toBe("processed");
    expect(applied[0].status).toBe("canceled");
  });

  it("resolves the user through the customer id when metadata is missing", async () => {
    const { store, applied } = memoryStore({
      async userIdForCustomer(customerId) {
        return customerId === "cus_1" ? "user-from-lookup" : null;
      },
    });
    const result = await processBillingEvent(
      store,
      subscriptionEvent({ metadata: { plan_id: "pro" } }),
    );
    expect(result.outcome).toBe("processed");
    expect(applied[0].userId).toBe("user-from-lookup");
  });

  it("fails loudly when the subscription cannot be attributed to anyone", async () => {
    const { store, applied } = memoryStore();
    const result = await processBillingEvent(
      store,
      subscriptionEvent({ metadata: { plan_id: "pro" } }),
    );
    expect(result.outcome).toBe("failed");
    expect(applied).toHaveLength(0);
  });

  it("records but ignores event types that do not move entitlements", async () => {
    const { store, applied, marks } = memoryStore();
    const result = await processBillingEvent(store, {
      id: "evt_inv",
      type: "invoice.payment_succeeded",
      created: 1_750_000_000,
      data: { object: { id: "in_1", customer: "cus_1", subscription: "sub_1" } },
    });
    expect(result.outcome).toBe("ignored");
    expect(applied).toHaveLength(0);
    expect(marks.find((m) => m.id === "evt_inv")?.status).toBe("ignored");
  });

  it("reports stale when the store refuses an out-of-order event", async () => {
    const { store } = memoryStore({
      async applySubscription() {
        return false;
      },
    });
    const result = await processBillingEvent(store, subscriptionEvent());
    expect(result.outcome).toBe("stale");
  });

  it("reads the interval from the price when metadata lacks it", async () => {
    const { store, applied } = memoryStore();
    await processBillingEvent(
      store,
      subscriptionEvent({ metadata: { user_id: "user-1", plan_id: "pro" } }),
    );
    expect(applied[0].billingInterval).toBe("monthly");
  });

  it("marks the event failed when the store throws, so Stripe retries", async () => {
    const { store, marks } = memoryStore({
      async applySubscription() {
        throw new Error("database sneezed");
      },
    });
    const result = await processBillingEvent(store, subscriptionEvent());
    expect(result.outcome).toBe("failed");
    expect(marks.find((m) => m.id === "evt_1")?.status).toBe("failed");
  });
});
