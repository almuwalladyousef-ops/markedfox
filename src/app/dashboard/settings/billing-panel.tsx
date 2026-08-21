"use client";

import { useActionState } from "react";

import {
  openBillingPortalAction,
  startCheckoutAction,
  type BillingFormState,
} from "@/lib/billing/actions";

const EMPTY: BillingFormState = {};

/**
 * The two billing moves a user can make: upgrade (Stripe Checkout) or manage
 * what they already pay for (Stripe's portal — card, interval, cancel). Stripe
 * hosts both flows, so no card number ever touches this app.
 */
export function BillingPanel({
  planId,
  configured,
  hasBillingHistory,
  plans,
}: {
  planId: string;
  configured: boolean;
  hasBillingHistory: boolean;
  /** Checkout-able plans, already filtered to ones with a Stripe price. */
  plans: { id: string; name: string; monthly: string; annual: string }[];
}) {
  const [checkoutState, checkoutAction, checkoutPending] = useActionState(
    startCheckoutAction,
    EMPTY,
  );
  const [portalState, portalAction, portalPending] = useActionState(
    () => openBillingPortalAction(),
    EMPTY,
  );

  const upgrades = plans.filter((plan) => plan.id !== planId);

  return (
    <section className="rounded-lg border border-line p-4">
      <h2 className="text-sm font-medium text-ink">Billing</h2>

      {!configured ? (
        <p className="mt-2 text-xs text-faint">
          Payments are not configured on this deployment yet. Plans still apply;
          checkout turns on with the Stripe keys.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-4">
          {upgrades.length > 0 ? (
            <div className="flex flex-col gap-2">
              {upgrades.map((plan) => (
                <form
                  key={plan.id}
                  action={checkoutAction}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line px-3 py-2"
                >
                  <input type="hidden" name="plan_id" value={plan.id} />
                  <span className="text-sm font-medium">{plan.name}</span>
                  <span className="flex items-center gap-2">
                    <button
                      type="submit"
                      name="interval"
                      value="monthly"
                      disabled={checkoutPending}
                      className="rounded-lg border border-line-strong px-3 py-1.5 text-xs transition hover:bg-chip disabled:opacity-50"
                    >
                      {plan.monthly}/mo
                    </button>
                    <button
                      type="submit"
                      name="interval"
                      value="annual"
                      disabled={checkoutPending}
                      className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-ink transition hover:brightness-[1.08] disabled:opacity-50"
                    >
                      {plan.annual}/yr — two months free
                    </button>
                  </span>
                </form>
              ))}
            </div>
          ) : null}

          {hasBillingHistory ? (
            <form action={portalAction}>
              <button
                type="submit"
                disabled={portalPending}
                className="rounded-lg border border-line-strong px-4 py-2 text-sm transition hover:bg-chip disabled:opacity-50"
              >
                {portalPending ? "Opening…" : "Manage billing"}
              </button>
              <span className="ml-2 text-xs text-faint">
                Card, invoices, switching plans, or canceling — on Stripe.
              </span>
            </form>
          ) : null}

          {checkoutState.message ? (
            <p className="text-xs text-danger">{checkoutState.message}</p>
          ) : null}
          {portalState.message ? (
            <p className="text-xs text-danger">{portalState.message}</p>
          ) : null}
        </div>
      )}
    </section>
  );
}
