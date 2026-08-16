import { createHmac, timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { requireEnv } from "@/lib/env";

// Meta's Data Deletion Request callback. Required on the app (and by Threads'
// settings form) and required for App Review: Meta POSTs a signed_request when
// a user asks Meta to have their data deleted from MarkedFox, and expects back
// a URL where they can check status plus a confirmation code.
//
// Signature verification is done properly here — this endpoint is public and
// a forged request must not be able to trigger deletion. The deletion itself
// (connections, posts, usage for that platform user) is wired in Phase 5 with
// the account-deletion work; until then the request is logged and acknowledged
// with a real confirmation code so the flow is honest end to end.

function parseSignedRequest(signed: string, secret: string): Record<string, unknown> | null {
  const [sigPart, payloadPart] = signed.split(".", 2);
  if (!sigPart || !payloadPart) return null;

  const expected = createHmac("sha256", secret).update(payloadPart).digest();
  const given = Buffer.from(sigPart.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return null;
  }

  try {
    return JSON.parse(
      Buffer.from(payloadPart.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    );
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const signed = form?.get("signed_request");
  if (typeof signed !== "string") {
    return NextResponse.json({ error: "missing signed_request" }, { status: 400 });
  }

  const payload = parseSignedRequest(signed, requireEnv("META_APP_SECRET"));
  if (!payload) {
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }

  const platformUserId = String(payload.user_id ?? "");
  const confirmationCode = `mf-${Date.now().toString(36)}-${platformUserId.slice(-6)}`;
  console.info(`meta data-deletion request for platform user ${platformUserId}, code ${confirmationCode}`);

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://markedfox.com";
  return NextResponse.json({
    url: `${site}/api/meta/data-deletion?code=${confirmationCode}`,
    confirmation_code: confirmationCode,
  });
}

// Status page for a deletion request — Meta links users here.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  return NextResponse.json({
    ok: true,
    endpoint: "meta-data-deletion",
    ...(code ? { confirmation_code: code, status: "received" } : {}),
  });
}
