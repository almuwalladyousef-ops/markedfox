"use server";

import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

import {
  getCheckoutPlan,
  getStripeCustomerId,
  saveStripeCustomerId,
} from "./store";
import {
  createCheckoutSession,
  createCustomer,
  createPortalSession,
  isStripeConfigured,
  StripeError,
} from "./stripe";

// The two billing entry points a user can press. Everything else is webhooks.

export type BillingFormState = { message?: string };

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://markedfox.com").replace(/\/+$/, "");
}

/**
 * Start a Stripe Checkout for a plan. The subscription row is NOT touched
 * here — entitlements change only when the webhook says the money moved.
 */
export async function startCheckoutAction(
  _previous: BillingFormState,
  formData: FormData,
): Promise<BillingFormState> {
  const user = await requireUser();

  if (!isStripeConfigured()) {
    return { message: "Payments are not configured on this deployment yet." };
  }

  const planId = String(formData.get("plan_id") ?? "");
  const intervalRaw = String(formData.get("interval") ?? "monthly");
  const interval = intervalRaw === "annual" ? "annual" : "monthly";

  const supabase = await createClient();
  const plan = await getCheckoutPlan(supabase, planId);
  if (!plan) return { message: "That plan cannot be checked out." };

  const priceId = interval === "annual" ? plan.priceAnnual : plan.priceMonthly;
  if (!priceId) {
    return {
      message: `${plan.name} has no ${interval} price configured yet — try the other billing interval.`,
    };
  }

  let checkoutUrl: string;
  try {
    // One Stripe customer per user, created on first checkout and reused
    // forever after — a second customer would orphan the first one's history.
    const service = createServiceRoleClient();
    let customerId = await getStripeCustomerId(supabase, user.id);
    if (!customerId) {
      const customer = await createCustomer({
        email: user.email || `${user.id}@users.markedfox.com`,
        userId: user.id,
      });
      customerId = customer.id;
      await saveStripeCustomerId(service, user.id, customerId);
    }

    const session = await createCheckoutSession({
      customerId,
      priceId,
      userId: user.id,
      planId: plan.id,
      interval,
      successUrl: `${siteUrl()}/dashboard/settings?checkout=success`,
      cancelUrl: `${siteUrl()}/dashboard/settings?checkout=canceled`,
    });
    if (!session.url) return { message: "Stripe did not return a checkout page. Try again." };
    checkoutUrl = session.url;
  } catch (error) {
    if (error instanceof StripeError) {
      return { message: `Could not start checkout: ${error.message}` };
    }
    throw error;
  }

  redirect(checkoutUrl);
}

/**
 * The Stripe customer portal: change card, switch interval, cancel. Stripe
 * hosts the whole flow, and the resulting webhooks land in the same processor
 * as everything else — which is why this needs no UI of ours.
 */
export async function openBillingPortalAction(): Promise<BillingFormState> {
  const user = await requireUser();

  if (!isStripeConfigured()) {
    return { message: "Payments are not configured on this deployment yet." };
  }

  const supabase = await createClient();
  const customerId = await getStripeCustomerId(supabase, user.id);
  if (!customerId) {
    return { message: "No billing history yet — subscribe to a plan first." };
  }

  let url: string;
  try {
    const session = await createPortalSession({
      customerId,
      returnUrl: `${siteUrl()}/dashboard/settings`,
    });
    url = session.url;
  } catch (error) {
    if (error instanceof StripeError) {
      return { message: `Could not open the billing portal: ${error.message}` };
    }
    throw error;
  }

  redirect(url);
}
