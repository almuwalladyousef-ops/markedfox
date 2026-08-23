import type { Metadata } from "next";

import { Card, Pill, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { getStripeCustomerId } from "@/lib/billing/store";
import { isStripeConfigured } from "@/lib/billing/stripe";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import { parsePlanLimits } from "@/lib/entitlements/types";
import { PLATFORMS, type Platform } from "@/lib/platforms/types";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/store";
import { LocalTime } from "@/components/local-time";

import { BillingPanel } from "../billing-panel";
import { Pane } from "../pane";

export const metadata: Metadata = { title: "Subscription · MarkedFox" };

// Every number on this page comes from the plans table, including which
// platforms a plan covers and what its X allowance is. Repricing is a row
// edit, and it has to stay one — a price written into this file is a price
// that will disagree with Stripe the first time it changes.
export default async function SubscriptionPane({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const params = await searchParams;
  const user = await requireUser();
  const active = await getActiveWorkspace();
  const supabase = await createClient();
  const snapshot = active
    ? await getEntitlementSnapshot(supabase, user.id, active.id)
    : null;

  const stripeReady = isStripeConfigured();
  const customerId = stripeReady
    ? await getStripeCustomerId(supabase, user.id)
    : null;

  const [{ data: planRows }, { data: subscription }] = await Promise.all([
    supabase
      .from("plans")
      .select("id, name, price_monthly_cents, price_annual_cents, limits")
      .eq("is_public", true)
      .order("price_monthly_cents"),
    supabase
      .from("subscriptions")
      .select("status, current_period_end, cancel_at_period_end")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const plans = ((planRows ?? []) as {
    id: string;
    name: string;
    price_monthly_cents: number;
    price_annual_cents: number | null;
    limits: unknown;
  }[]).map((plan) => {
    const limits = parsePlanLimits(plan.limits);
    const platforms: Platform[] =
      limits.platforms === null ? [...PLATFORMS] : limits.platforms;
    return {
      id: plan.id,
      name: plan.name,
      monthly: `$${(plan.price_monthly_cents / 100).toFixed(0)}`,
      annual: `$${((plan.price_annual_cents ?? 0) / 100).toFixed(0)}`,
      features: [
        limits.postsPerDay === null
          ? "Unlimited posts"
          : `${limits.postsPerDay} posts a day`,
        // X is the permanent exception to the word "unlimited", so it is stated
        // on the card rather than in fine print somewhere else.
        limits.xPostsPerMonth === 0
          ? "No X"
          : `${limits.xPostsPerMonth} X posts a month, no external links`,
        limits.dmRulesMax === null
          ? "Unlimited DM rules"
          : `${limits.dmRulesMax} DM rule${limits.dmRulesMax === 1 ? "" : "s"}`,
        `${limits.dmSendsPerMonth.toLocaleString()} DM sends a month`,
        limits.maxConnectedAccountsPerWorkspace === null
          ? "Unlimited accounts per workspace"
          : `${limits.maxConnectedAccountsPerWorkspace} accounts per workspace`,
        limits.researchCreditsPerMonth > 0
          ? `${limits.researchCreditsPerMonth} research credits a month`
          : "No research credits",
      ],
      platforms,
    };
  });

  const row = subscription as {
    status: string;
    current_period_end: string | null;
    cancel_at_period_end: boolean | null;
  } | null;

  return (
    <Pane
      title="Manage subscription"
      blurb="Everything below is read from the plans table, so a price here is the price Stripe charges."
      actions={
        <Pill tone="accent" className="capitalize">
          {snapshot?.planId ?? "free"}
        </Pill>
      }
    >
      {params.checkout === "success" ? (
        <Card className="border-ok bg-ok-soft px-5 py-4 text-[14px]/[21px] text-ok">
          Payment received. Your plan updates within a few seconds of
          Stripe&rsquo;s confirmation — reload if it has not yet.
        </Card>
      ) : params.checkout === "canceled" ? (
        <Card className="px-5 py-4 text-[14px]/[21px] text-muted">
          Checkout canceled — nothing was charged.
        </Card>
      ) : null}

      <dl className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        <Stat
          label="Status"
          value={<span className="capitalize">{row?.status ?? "free"}</span>}
        />
        <Stat
          label={row?.cancel_at_period_end ? "Access ends" : "Next billing date"}
          value={
            row?.current_period_end ? (
              <LocalTime value={row.current_period_end} mode="date" />
            ) : (
              "—"
            )
          }
          note={
            row?.cancel_at_period_end
              ? "Cancelled — the plan stays until then"
              : undefined
          }
        />
      </dl>

      <BillingPanel
        planId={snapshot?.planId ?? "free"}
        configured={stripeReady}
        hasBillingHistory={customerId !== null}
        plans={plans}
      />
    </Pane>
  );
}
