import { NextResponse, type NextRequest } from "next/server";

import { getSiteUrl } from "@/lib/auth/site-url";
import {
  deleteMetaUserData,
  getDeletionRequest,
} from "@/lib/connections/meta-deletion";
import { verifyMetaSignedRequest } from "@/lib/connections/meta-signed-request";
import { createServiceRoleClient } from "@/lib/supabase/service";

// Meta's Data Deletion Request callback. Required on the app (and by Threads'
// settings form) and required for App Review: Meta POSTs a signed_request
// when a user asks Meta to have their data deleted from MarkedFox, and
// expects back a URL where they can check status plus a confirmation code.
//
// Signature verification first — this endpoint is public and a forged
// request must not be able to delete anything. A verified request deletes
// the user's connections and the publishing history we hold for them, and
// records the request so the status URL can answer for that code and no
// other.

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const signed = form?.get("signed_request");
  if (typeof signed !== "string") {
    return NextResponse.json({ error: "missing signed_request" }, { status: 400 });
  }

  const verified = verifyMetaSignedRequest(signed);
  if (!verified) {
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }

  const metaUserId = String(verified.payload.user_id ?? "");
  if (!metaUserId) {
    return NextResponse.json({ error: "no user_id in payload" }, { status: 400 });
  }

  const site = await getSiteUrl();
  try {
    const result = await deleteMetaUserData(
      createServiceRoleClient(),
      verified.app,
      metaUserId,
    );
    console.info(
      `meta data-deletion (${verified.app}) for user ${metaUserId}: ` +
        `${result.connectionsDeleted} connection(s), ${result.historyDeleted} history row(s), code ${result.confirmationCode}`,
    );
    return NextResponse.json({
      url: `${site}/api/meta/data-deletion?code=${result.confirmationCode}`,
      confirmation_code: result.confirmationCode,
    });
  } catch (error) {
    console.error(`meta data-deletion for user ${metaUserId} failed:`, error);
    // A 5xx makes Meta retry later, which is the right outcome for a
    // transient failure: the request is not lost, just not done yet.
    return NextResponse.json({ error: "deletion failed, will retry" }, { status: 500 });
  }
}

// Status page for a deletion request — Meta links users here, so it is a
// human-readable page rather than JSON. Unknown codes are said to be unknown.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ ok: true, endpoint: "meta-data-deletion" });
  }

  const found = await getDeletionRequest(createServiceRoleClient(), code).catch((error) => {
    console.error("deletion status lookup failed:", error);
    return null;
  });

  const title = !found
    ? "Unknown confirmation code"
    : found.status === "completed"
      ? "Deletion complete"
      : found.status === "failed"
        ? "Deletion pending"
        : "Deletion request received";
  const body = !found
    ? `We have no deletion request with the code ${escapeHtml(code)}. If you received this code from Facebook or Instagram, contact support@markedfox.com.`
    : found.status === "completed"
      ? `The data MarkedFox held for the connected accounts in this request was deleted on ${new Date(found.completedAt ?? found.requestedAt).toUTCString()}.`
      : found.status === "failed"
        ? `The request was received on ${new Date(found.requestedAt).toUTCString()} and is being completed by hand. Contact support@markedfox.com if you have not heard from us within 30 days.`
        : `The request was received on ${new Date(found.requestedAt).toUTCString()} and is in progress.`;

  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} · MarkedFox</title><style>body{font-family:system-ui,sans-serif;background:#0a0a0a;color:#fafafa;margin:0;display:grid;place-items:center;min-height:100vh}main{max-width:32rem;padding:2rem}h1{font-size:1.5rem}p{color:#a3a3a3;line-height:1.6}code{color:#fafafa}a{color:#fafafa}</style></head><body><main><h1>${title}</h1><p>${body}</p><p>Confirmation code: <code>${escapeHtml(code)}</code></p><p><a href="/privacy">Privacy policy</a></p></main></body></html>`,
    { status: found ? 200 : 404, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}
