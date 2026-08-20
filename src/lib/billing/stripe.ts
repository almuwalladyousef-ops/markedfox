// A thin Stripe client over fetch.
//
// No SDK, for the same reason the R2 signing is hand-rolled: this uses six
// endpoints, the box has 2GB of RAM, and a dependency that ships a hundred
// files to call six URLs is not a good trade. Stripe's REST API is stable and
// form-encoded, which is a few lines here.
//
// The parts worth testing — signature verification and form encoding — are
// pure and exported. The network calls are not.

import { createHmac, timingSafeEqual } from "node:crypto";

import { requireEnv } from "@/lib/env";

const API = "https://api.stripe.com/v1";
const TIMEOUT_MS = 20_000;

export class StripeError extends Error {
  constructor(
    message: string,
    readonly code: "not_configured" | "api" | "signature",
    readonly status?: number,
  ) {
    super(message);
    this.name = "StripeError";
  }
}

/** True when this deployment can take a payment at all. The UI asks before
 *  offering a checkout button, so a missing key is "not yet" rather than a
 *  500 on click. */
export function isStripeConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}

/**
 * Stripe takes form-encoded bodies with bracket notation for nested values —
 * `line_items[0][price]=price_123`. Exported because getting this wrong
 * produces a confusing 400 from Stripe rather than a local error.
 */
export function encodeForm(
  value: unknown,
  prefix = "",
  out: string[] = [],
): string {
  if (value === undefined || value === null) return out.join("&");

  if (Array.isArray(value)) {
    value.forEach((item, index) => encodeForm(item, `${prefix}[${index}]`, out));
    return out.join("&");
  }

  if (typeof value === "object") {
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      encodeForm(inner, prefix ? `${prefix}[${key}]` : key, out);
    }
    return out.join("&");
  }

  out.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(value))}`);
  return out.join("&");
}

async function call<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown; idempotencyKey?: string } = {
    method: "GET",
  },
): Promise<T> {
  let key: string;
  try {
    key = requireEnv("STRIPE_SECRET_KEY");
  } catch {
    throw new StripeError("Billing is not configured on this deployment", "not_configured");
  }

  const headers: Record<string, string> = {
    authorization: `Bearer ${key}`,
    "content-type": "application/x-www-form-urlencoded",
    // Pinned: an API version that changes under us would change webhook
    // payload shapes without a deploy.
    "stripe-version": "2026-03-31.basil",
  };
  // Retries must not double-charge. Every mutating call carries a key derived
  // from what it is doing, so a retried request is the same request.
  if (init.idempotencyKey) headers["idempotency-key"] = init.idempotencyKey;

  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method: init.method,
      headers,
      body: init.body ? encodeForm(init.body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new StripeError(`Stripe did not answer: ${(error as Error).message}`, "api");
  }

  const text = await response.text();
  if (!response.ok) {
    let detail = text.slice(0, 300);
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } };
      if (parsed.error?.message) detail = parsed.error.message;
    } catch {
      // Keep the raw body; a non-JSON error from Stripe is worth seeing whole.
    }
    throw new StripeError(`Stripe returned ${response.status}: ${detail}`, "api", response.status);
  }

  return JSON.parse(text) as T;
}

// ── the six endpoints ──────────────────────────────────────────────────────

export interface StripeCustomer {
  id: string;
  email?: string | null;
}

export async function createCustomer(input: {
  email: string;
  userId: string;
}): Promise<StripeCustomer> {
  return call<StripeCustomer>("/customers", {
    method: "POST",
    // The user id travels on the customer as well as the session, so a webhook
    // that arrives without session metadata can still identify the tenant.
    body: { email: input.email, metadata: { user_id: input.userId } },
    idempotencyKey: `customer:${input.userId}`,
  });
}

export interface CheckoutSession {
  id: string;
  url: string | null;
}

export async function createCheckoutSession(input: {
  customerId: string;
  priceId: string;
  userId: string;
  planId: string;
  interval: "monthly" | "annual";
  successUrl: string;
  cancelUrl: string;
}): Promise<CheckoutSession> {
  return call<CheckoutSession>("/checkout/sessions", {
    method: "POST",
    body: {
      mode: "subscription",
      customer: input.customerId,
      line_items: [{ price: input.priceId, quantity: 1 }],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      // Metadata on BOTH the session and the subscription: the session carries
      // it through checkout.session.completed, the subscription through every
      // later customer.subscription.* event.
      metadata: { user_id: input.userId, plan_id: input.planId, interval: input.interval },
      subscription_data: {
        metadata: { user_id: input.userId, plan_id: input.planId, interval: input.interval },
      },
      allow_promotion_codes: true,
    },
  });
}

export interface PortalSession {
  url: string;
}

export async function createPortalSession(input: {
  customerId: string;
  returnUrl: string;
}): Promise<PortalSession> {
  return call<PortalSession>("/billing_portal/sessions", {
    method: "POST",
    body: { customer: input.customerId, return_url: input.returnUrl },
  });
}

export interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_start?: number;
  current_period_end?: number;
  metadata?: Record<string, string>;
  items?: { data?: { price?: { id?: string; recurring?: { interval?: string } } }[] };
}

export async function getSubscription(id: string): Promise<StripeSubscription> {
  return call<StripeSubscription>(`/subscriptions/${encodeURIComponent(id)}`);
}

export async function getCheckoutSession(id: string): Promise<{
  id: string;
  customer?: string | null;
  subscription?: string | null;
  metadata?: Record<string, string>;
}> {
  return call(`/checkout/sessions/${encodeURIComponent(id)}`);
}

// ── webhook signature ──────────────────────────────────────────────────────

/**
 * Verify Stripe's `Stripe-Signature` header against the RAW request body.
 *
 * Pure and exported, because this is the door: a forged event could grant any
 * plan to anyone. Three checks, and all three matter — the timestamp (so a
 * captured event cannot be replayed indefinitely), the HMAC over
 * `timestamp.body` (not the body alone), and a timing-safe compare.
 */
export function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  now: Date = new Date(),
  toleranceSeconds = 300,
): { ok: true } | { ok: false; reason: string } {
  if (!header) return { ok: false, reason: "missing signature header" };

  let timestamp: string | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key?.trim() === "t") timestamp = value?.trim() ?? null;
    // v1 is the current scheme; anything else is ignored rather than trusted.
    if (key?.trim() === "v1" && value) signatures.push(value.trim());
  }

  if (!timestamp) return { ok: false, reason: "no timestamp in signature header" };
  if (signatures.length === 0) return { ok: false, reason: "no v1 signature" };

  const sent = Number(timestamp);
  if (!Number.isFinite(sent)) return { ok: false, reason: "malformed timestamp" };
  const ageSeconds = Math.abs(now.getTime() / 1000 - sent);
  if (ageSeconds > toleranceSeconds) {
    return { ok: false, reason: `timestamp outside tolerance (${Math.round(ageSeconds)}s)` };
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  for (const candidate of signatures) {
    let candidateBuffer: Buffer;
    try {
      candidateBuffer = Buffer.from(candidate, "hex");
    } catch {
      continue;
    }
    if (
      candidateBuffer.length === expectedBuffer.length &&
      timingSafeEqual(candidateBuffer, expectedBuffer)
    ) {
      return { ok: true };
    }
  }

  return { ok: false, reason: "signature mismatch" };
}
