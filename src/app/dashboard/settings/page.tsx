import type { Metadata } from "next";

import Link from "next/link";
import { cookies } from "next/headers";

import {
  ButtonLink,
  Card,
  CardTitle,
  Notice,
  Page,
  PageHeader,
} from "@/components/ui";
import { ThemeSegmented } from "@/components/theme-toggle";
import { requireUser } from "@/lib/auth/session";
import { getStripeCustomerId } from "@/lib/billing/store";
import { isStripeConfigured } from "@/lib/billing/stripe";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import { createClient } from "@/lib/supabase/server";
import { normalizeTheme, THEME_COOKIE } from "@/lib/theme";
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

  const theme = normalizeTheme((await cookies()).get(THEME_COOKIE)?.value);

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
    <Page width="max-w-[720px]">
      <PageHeader title="Settings" subtitle={user.email ?? undefined} />

      {params.checkout === "success" ? (
        <Notice tone="ok">
          Payment received. Your plan updates within a few seconds of
          Stripe&rsquo;s confirmation — reload if it has not yet.
        </Notice>
      ) : params.checkout === "canceled" ? (
        <Notice>Checkout canceled — nothing was charged.</Notice>
      ) : null}

      <Card>
        <CardTitle
          action={
            <ButtonLink href="/pricing" tone="primary" size="sm">
              Compare plans
            </ButtonLink>
          }
        >
          Plan
        </CardTitle>
        <p className="font-display mt-2 text-[22px] font-bold capitalize">
          {snapshot?.planId ?? "free"}
        </p>
        <p className="mt-1 text-xs text-faint">
          Workspaces {snapshot?.usage.workspaceCount ?? 0}
          {snapshot?.limits.maxWorkspaces === null
            ? " / unlimited"
            : ` / ${snapshot?.limits.maxWorkspaces ?? "—"}`}{" "}
          · posts, DM sends, and credits pooled across all of them.
        </p>
      </Card>

      <Card>
        <CardTitle hint="theme also switches from the toggle at the bottom of the sidebar">
          Appearance
        </CardTitle>
        <div className="mt-3">
          <ThemeSegmented initial={theme} />
        </div>
      </Card>

      <BillingPanel
        planId={snapshot?.planId ?? "free"}
        configured={stripeReady}
        hasBillingHistory={customerId !== null}
        plans={checkoutPlans}
      />

      <Card>
        <CardTitle>Your data</CardTitle>
        <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-[13px]/[19px] text-muted">
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
            <Link href="/privacy" className="text-accent underline">
              privacy policy
            </Link>
            .
          </li>
        </ul>
      </Card>

      <section className="rounded-[14px] border border-danger-soft bg-danger-soft p-[18px]">
        <h2 className="text-sm font-semibold text-danger">Delete account</h2>
        <p className="mt-2 text-[13px]/[19px] text-muted">
          Permanently deletes your MarkedFox account and everything in it:
          workspaces, connected accounts and their tokens, posts (scheduled ones
          will not go out), automation rules, and uploaded media. Where a
          platform offers it, we also ask the platform to revoke the access you
          granted. This cannot be undone.
        </p>
        <DeleteAccountForm />
      </section>
    </Page>
  );
}
