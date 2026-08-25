"use client";

import { useActionState, useState } from "react";

import { Icon } from "@/components/icons";
import { PlatformTile } from "@/components/platform-icon";
import {
  Busy,
  Button,
  Card,
  cx,
  Notice,
  Pill,
  segmentedItem,
  segmentedTrack,
} from "@/components/ui";
import {
  openBillingPortalAction,
  startCheckoutAction,
  type BillingFormState,
} from "@/lib/billing/actions";
import type { Platform } from "@/lib/platforms/types";

const EMPTY: BillingFormState = {};

/**
 * The two billing moves a user can make: upgrade (Stripe Checkout) or manage
 * what they already pay for (Stripe's portal — card, interval, cancel). Stripe
 * hosts both flows, so no card number ever touches this app.
 *
 * The interval is one switch above all the plans rather than two buttons on
 * each: comparing three plans at two prices means six numbers, and the
 * question people are actually answering — monthly or yearly — is asked once.
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
  /** Every public plan, current one included, so the grid can compare. */
  plans: {
    id: string;
    name: string;
    monthly: string;
    annual: string;
    features: string[];
    platforms: Platform[];
  }[];
}) {
  const [checkoutState, checkoutAction, checkoutPending] = useActionState(
    startCheckoutAction,
    EMPTY,
  );
  const [portalState, portalAction, portalPending] = useActionState(
    () => openBillingPortalAction(),
    EMPTY,
  );
  const [interval, setInterval] = useState<"monthly" | "annual">("annual");

  return (
    <div className="flex flex-col gap-5">
      {!configured ? (
        <Notice tone="warn">
          Payments are not configured on this deployment yet. Plans still apply;
          checkout turns on with the Stripe keys.
        </Notice>
      ) : null}

      {hasBillingHistory ? (
        <Card className="flex flex-col gap-3 px-5 py-4">
          <p className="text-[14.5px] font-semibold text-ink">
            Payment method, invoices, and cancelling
          </p>
          <p className="text-[13.5px]/[20px] text-muted">
            All of it lives on Stripe, which is also where your card is — it has
            never been stored here.
          </p>
          <form action={portalAction}>
            <Button type="submit" size="sm" disabled={portalPending}>
              <Busy busy={portalPending}>
                {portalPending ? "Opening…" : "Manage billing on Stripe"}
              </Busy>
              <Icon name="external" className="h-3.5 w-3.5" />
            </Button>
          </form>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-[18px] font-bold tracking-[-0.01em] text-ink">
          All plans
        </h3>
        <div className={segmentedTrack}>
          <button
            type="button"
            onClick={() => setInterval("monthly")}
            aria-pressed={interval === "monthly"}
            className={segmentedItem(interval === "monthly")}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setInterval("annual")}
            aria-pressed={interval === "annual"}
            className={segmentedItem(interval === "annual")}
          >
            Yearly · 2 months free
          </button>
        </div>
      </div>

      <ul className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-4">
        {plans.map((plan) => {
          const current = plan.id === planId;
          return (
            <li key={plan.id}>
              <Card
                className={cx(
                  "flex h-full flex-col gap-4 px-5 py-5",
                  current ? "border-2 border-accent" : "",
                )}
              >
                <div>
                  <p className="font-display text-[17px] font-bold text-ink">
                    {plan.name}
                  </p>
                  <p className="font-display mt-1.5 text-[26px] font-bold tracking-[-0.02em] text-ink">
                    {interval === "monthly" ? plan.monthly : plan.annual}
                    <span className="text-[13px] font-semibold text-faint">
                      {interval === "monthly" ? " /mo" : " /yr"}
                    </span>
                  </p>
                </div>

                <ul className="flex flex-col gap-2 text-[13.5px]/[20px] text-muted">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Icon
                        name="check"
                        className="mt-1 h-3 w-3 shrink-0 text-ok"
                        strokeWidth={3}
                      />
                      {feature}
                    </li>
                  ))}
                </ul>

                {plan.platforms.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {plan.platforms.map((platform) => (
                      <PlatformTile key={platform} platform={platform} size={20} />
                    ))}
                  </div>
                ) : null}

                <div className="mt-auto pt-1">
                  {current ? (
                    <Button size="sm" className="w-full" disabled>
                      Current plan
                    </Button>
                  ) : configured ? (
                    <form action={checkoutAction}>
                      <input type="hidden" name="plan_id" value={plan.id} />
                      <input type="hidden" name="interval" value={interval} />
                      <Button
                        type="submit"
                        tone="primary"
                        size="sm"
                        className="w-full"
                        disabled={checkoutPending}
                      >
                        <Busy busy={checkoutPending}>
                          {checkoutPending ? "Opening…" : `Switch to ${plan.name}`}
                        </Busy>
                      </Button>
                    </form>
                  ) : (
                    <Pill tone="neutral">Checkout not configured</Pill>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>

      {checkoutState.message ? (
        <Notice tone="danger">{checkoutState.message}</Notice>
      ) : null}
      {portalState.message ? (
        <Notice tone="danger">{portalState.message}</Notice>
      ) : null}
    </div>
  );
}
