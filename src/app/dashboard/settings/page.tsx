import type { Metadata } from "next";

import Link from "next/link";

import { requireUser } from "@/lib/auth/session";
import { getStripeCustomerId } from "@/lib/billing/store";
import { isStripeConfigured } from "@/lib/billing/stripe";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/store";

import { BillingPanel } from "./billing-panel";
import { DeleteAccountForm } from "./delete-account-form";

export const metadata: Metadata = { title: "Settings · MarkedFox" };

// Account settings. Small on purpose: the things a user needs that are not
// about a workspace — which plan they are on, and the door out.
export default async function SettingsPage({
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
  // Which plans can be bought right now: public, priced, and mapped to Stripe.
  const { data: planRows } = await supabase
    .from("plans")
    .select("id, name, price_monthly_cents, price_annual_cents, is_public, stripe_price_monthly, stripe_price_annual")
    .eq("is_public", true)
    .gt("price_monthly_cents", 0)
    .order("price_monthly_cents");
  const checkoutPlans = ((planRows ?? []) as {
    id: string;
    name: string;
    price_monthly_cents: number;
    price_annual_cents: number | null;
    stripe_price_monthly: string | null;
    stripe_price_annual: string | null;
  }[])
    .filter((plan) => plan.stripe_price_monthly || plan.stripe_price_annual)
    .map((plan) => ({
      id: plan.id,
      name: plan.name,
      monthly: `$${(plan.price_monthly_cents / 100).toFixed(0)}`,
      annual: `$${((plan.price_annual_cents ?? 0) / 100).toFixed(0)}`,
    }));

  return (
    <>
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="mt-1 text-sm text-muted">{user.email}</p>
        </div>
        <Link
          href="/dashboard"
          className="rounded-md border border-line px-3 py-1.5 text-sm text-ink transition hover:border-line-strong hover:text-ink"
        >
          Back to dashboard
        </Link>
      </header>

      {params.checkout === "success" ? (
        <p className="rounded-lg border border-ok bg-ok-soft px-4 py-3 text-sm text-ok">
          Payment received. Your plan updates within a few seconds of
          Stripe&rsquo;s confirmation — reload if it has not yet.
        </p>
      ) : params.checkout === "canceled" ? (
        <p className="rounded-lg border border-line bg-panel px-4 py-3 text-sm text-muted">
          Checkout canceled — nothing was charged.
        </p>
      ) : null}

      <section className="rounded-lg border border-line p-4">
        <h2 className="text-sm font-medium text-ink">Plan</h2>
        <p className="mt-2 text-lg font-semibold capitalize">
          {snapshot?.planId ?? "free"}
        </p>
        <p className="mt-1 text-xs text-faint">
          Workspaces: {snapshot?.usage.workspaceCount ?? 0}
          {snapshot?.limits.maxWorkspaces === null
            ? " / unlimited"
            : ` / ${snapshot?.limits.maxWorkspaces ?? "—"}`}
          . Posts, DM sends, and credits are pooled across all of them.
        </p>
        <Link
          href="/pricing"
          className="mt-3 inline-block text-sm text-ink underline hover:text-white"
        >
          Compare plans
        </Link>
      </section>

      <BillingPanel
        planId={snapshot?.planId ?? "free"}
        configured={stripeReady}
        hasBillingHistory={customerId !== null}
        plans={checkoutPlans}
      />

      <section className="rounded-lg border border-line p-4">
        <h2 className="text-sm font-medium text-ink">Your data</h2>
        <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted">
          <li>
            Connected accounts and their tokens: disconnect any of them from the
            dashboard with the × next to its name.
          </li>
          <li>
            Uploaded media is deleted from storage automatically once a post is
            done with it.
          </li>
          <li>
            Everything else — workspaces, posts, rules, usage records — goes when
            you delete the account below. See the{" "}
            <Link href="/privacy" className="underline">
              privacy policy
            </Link>
            .
          </li>
        </ul>
      </section>

      <section className="rounded-lg border border-danger bg-danger-soft p-4">
        <h2 className="text-sm font-medium text-danger">Delete account</h2>
        <p className="mt-2 text-sm text-muted">
          Permanently deletes your MarkedFox account and everything in it:
          workspaces, connected accounts and their tokens, posts (scheduled ones
          will not go out), automation rules, and uploaded media. Where a
          platform offers it, we also ask the platform to revoke the access you
          granted. This cannot be undone.
        </p>
        <DeleteAccountForm />
      </section>
    </>
  );
}
