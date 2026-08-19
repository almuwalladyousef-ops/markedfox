import { NextResponse, type NextRequest } from "next/server";

import { revokeMetaUser } from "@/lib/connections/meta-deletion";
import { verifyMetaSignedRequest } from "@/lib/connections/meta-signed-request";
import { createServiceRoleClient } from "@/lib/supabase/service";

// Meta calls this when a user removes MarkedFox from their Facebook,
// Instagram, or Threads settings. Required as a configured URL on the app;
// Threads in particular refuses to save its settings form without one.
//
// The payload is a signed_request. An unverifiable one is acknowledged but
// ignored — this endpoint is public, and a 200 is what Meta needs to record
// the callback as healthy, but nothing is deleted on anyone's say-so. A
// verified one deletes our copy of that user's tokens for the product that
// signed it: Meta has already invalidated them, and the privacy policy says
// disconnecting deletes tokens.
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const signed = form?.get("signed_request");
  if (typeof signed !== "string") {
    console.info("meta deauthorize callback received with no signed_request");
    return NextResponse.json({ ok: true });
  }

  const verified = verifyMetaSignedRequest(signed);
  if (!verified) {
    console.warn("meta deauthorize callback with a signature that did not verify");
    return NextResponse.json({ ok: true });
  }

  const metaUserId = String(verified.payload.user_id ?? "");
  if (!metaUserId) {
    return NextResponse.json({ ok: true });
  }

  try {
    const { connectionsDeleted } = await revokeMetaUser(
      createServiceRoleClient(),
      verified.app,
      metaUserId,
    );
    console.info(
      `meta deauthorize (${verified.app}) for user ${metaUserId}: ${connectionsDeleted} connection(s) deleted`,
    );
  } catch (error) {
    // Logged, not surfaced: Meta retries on non-2xx, and a transient
    // database error should not make it hammer us — the tokens are dead on
    // Meta's side either way, and the next publish marks the row expired.
    console.error(`meta deauthorize for user ${metaUserId} failed:`, error);
  }
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "meta-deauthorize" });
}
