import { NextResponse } from "next/server";

import { processBillingEvent, type StripeEventEnvelope } from "@/lib/billing/events";
import { createBillingStore } from "@/lib/billing/store";
import { verifyStripeSignature } from "@/lib/billing/stripe";
import { createServiceRoleClient } from "@/lib/supabase/service";

// Stripe's webhook. The only writer of entitlements besides account deletion,
// which is exactly the design: the processor's job is writing to
// `subscriptions`, and swapping processors later is one adapter file.
//
// Contract with Stripe: answer 2xx fast or be retried. Signature failures are
// 400 (a retry of a forgery is still a forgery); processing failures are 500
// so Stripe retries them; everything verified is 200 even when ignored.

export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    // Unconfigured = this endpoint does not exist yet. 404, matching how the
    // rest of the app treats missing platform config.
    return NextResponse.json({ error: "not configured" }, { status: 404 });
  }

  // The RAW body: any re-serialisation changes bytes and breaks the HMAC.
  const rawBody = await request.text();
  const verdict = verifyStripeSignature(
    rawBody,
    request.headers.get("stripe-signature"),
    secret,
  );
  if (!verdict.ok) {
    return NextResponse.json({ error: verdict.reason }, { status: 400 });
  }

  let event: StripeEventEnvelope;
  try {
    const parsed = JSON.parse(rawBody) as Partial<StripeEventEnvelope>;
    if (
      typeof parsed.id !== "string" ||
      typeof parsed.type !== "string" ||
      typeof parsed.created !== "number" ||
      typeof parsed.data?.object !== "object" ||
      parsed.data.object === null
    ) {
      return NextResponse.json({ error: "malformed event" }, { status: 400 });
    }
    event = parsed as StripeEventEnvelope;
  } catch {
    return NextResponse.json({ error: "not JSON" }, { status: 400 });
  }

  const store = createBillingStore(createServiceRoleClient());
  const result = await processBillingEvent(store, event);

  if (result.outcome === "failed") {
    // 500 on purpose: Stripe retries with backoff, and a transient database
    // error should get those retries. A permanently bad event ends up in
    // billing_events with status 'failed' for a human either way.
    return NextResponse.json({ error: result.detail ?? "failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true, outcome: result.outcome });
}
