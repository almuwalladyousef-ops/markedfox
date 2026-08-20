import { after, NextResponse, type NextRequest } from "next/server";

import { getSiteUrl } from "@/lib/auth/site-url";
import { drainDmEngine } from "@/lib/dm/drain";
import { parseInstagramWebhook, verifyMetaSignature } from "@/lib/dm/meta-webhook";
import { recordWebhookEvents } from "@/lib/dm/store";
import { createServiceRoleClient } from "@/lib/supabase/service";

// Meta's webhook for the whole app — every tenant's Instagram comments and
// messages arrive here and are fanned out by account id.
//
// GET  is Meta's one-time verification handshake (hub.challenge echo).
// POST is a delivery: verify the signature over the RAW bytes, record every
//      event (deduplicated by Meta's own ids), answer 200 at once — Meta
//      retries and eventually disables a webhook that is slow — and run the
//      engine after the response has gone out.
//
// No session, no RLS: the service-role client, with the engine filtering by
// the account each event names.

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (
    verifyToken &&
    params.get("hub.mode") === "subscribe" &&
    params.get("hub.verify_token") === verifyToken &&
    params.get("hub.challenge")
  ) {
    return new NextResponse(params.get("hub.challenge"), {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }
  return NextResponse.json({ error: "verification failed" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const raw = await request.text();
  if (!verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"), secret)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "not json" }, { status: 400 });
  }

  const events = parseInstagramWebhook(body);
  if (events.length === 0) {
    return NextResponse.json({ received: 0 });
  }

  const service = createServiceRoleClient();
  let stored = 0;
  try {
    stored = (await recordWebhookEvents(service, events)).length;
  } catch (error) {
    // A 5xx makes Meta retry this delivery, which is what we want if the
    // database blinked — the events are not lost, just not recorded yet.
    console.error("meta webhook: could not record events", error);
    return NextResponse.json({ error: "storage" }, { status: 500 });
  }

  if (stored > 0) {
    const siteUrl = await getSiteUrl();
    after(async () => {
      try {
        const summary = await drainDmEngine(service, { siteUrl });
        console.log(
          `dm engine: webhook drain — ${summary.eventsProcessed} processed, ${summary.rulesMatched} matched, ${summary.jobsQueued} queued, ${summary.worker.sent} sent`,
        );
      } catch (error) {
        console.error("dm engine: webhook drain failed", error);
      }
    });
  }

  return NextResponse.json({ received: events.length, stored });
}
