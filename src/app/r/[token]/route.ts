import { NextResponse, type NextRequest } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/service";

// Tracked links from DMs: /r/<token> → the destination, with a click
// recorded against the rule and the contact it was sent to. This is the
// "click tracking with per-rule analytics" the brief asks for; button taps
// inside Instagram come back as postbacks and are recorded by the engine.
//
// Public and unauthenticated — the person clicking is the DM's recipient,
// not a MarkedFox user. Unknown tokens 404; nothing about other links leaks.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(token)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const service = createServiceRoleClient();
  const { data: link, error } = await service
    .from("dm_links")
    .select("id, user_id, workspace_id, rule_id, job_id, contact_id, destination_url, clicks")
    .eq("token", token)
    .maybeSingle();
  if (error || !link) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Best-effort bookkeeping; the redirect must not wait on it or fail with it.
  void Promise.all([
    service.from("dm_links").update({ clicks: (link.clicks ?? 0) + 1 }).eq("id", link.id),
    service.from("dm_events").insert({
      user_id: link.user_id,
      workspace_id: link.workspace_id,
      rule_id: link.rule_id,
      job_id: link.job_id,
      contact_id: link.contact_id,
      kind: "clicked",
      metadata: { token },
    }),
  ]).catch((e) => console.error("dm link: could not record click", e));

  // Defence in depth on the scheme. The rule builder already refuses anything
  // that is not http(s) (lib/dm/rules.ts), so a bad row should be impossible —
  // but this endpoint turns a stored string into a Location header for a
  // stranger's browser, and that is the one place worth checking twice. A row
  // that somehow held `javascript:` or `data:` would make markedfox.com the
  // launcher for it.
  let destination: URL;
  try {
    destination = new URL(link.destination_url);
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (destination.protocol !== "https:" && destination.protocol !== "http:") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.redirect(destination.toString(), { status: 302 });
}
