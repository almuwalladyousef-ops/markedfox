import { NextResponse, type NextRequest } from "next/server";

// Meta calls this when a user removes MarkedFox from their Facebook, Instagram,
// or Threads settings. Required as a configured URL on the app; Threads in
// particular refuses to save its settings form without one.
//
// The payload is a signed_request. Full handling — verifying the signature and
// marking the user's connections revoked — lands with the Phase 5 data-deletion
// work. Until then, acknowledge with 200 so Meta records the callback as
// healthy; the connection will fail at next token use and be marked expired by
// getFreshConnectionTokens.
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const signed = form?.get("signed_request");
  console.info(
    `meta deauthorize callback received (${signed ? "signed_request present" : "no payload"})`,
  );
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "meta-deauthorize" });
}
