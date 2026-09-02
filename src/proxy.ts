import { NextResponse, type NextRequest } from "next/server";

import {
  buildContentSecurityPolicy,
  generateNonce,
} from "@/lib/security/csp";
import { ALLOW_HEADER, isAllowedMethod } from "@/lib/security/methods";
import { updateSession } from "@/lib/supabase/middleware";

export default async function proxy(request: NextRequest) {
  // Before anything else, including the Supabase round trip: a method we do
  // not handle should cost nothing.
  //
  // This is the second line, not the first. TRACE, TRACK and CONNECT never
  // arrive here at all — Next builds a WHATWG Request out of the Node request
  // before middleware runs, and that constructor throws on those three, which
  // surfaced as a bare 500. Caddy refuses them at the edge for that reason (see
  // deploy/Caddyfile). What this catches is everything else: a method Caddy
  // forwards and no route implements.
  if (!isAllowedMethod(request.method)) {
    return new NextResponse("Method Not Allowed\n", {
      status: 405,
      headers: {
        allow: ALLOW_HEADER,
        "content-type": "text/plain; charset=utf-8",
        // A 405 is about the method, never about the body of some other page.
        "cache-control": "no-store",
      },
    });
  }

  const nonce = generateNonce();
  const csp = buildContentSecurityPolicy({
    nonce,
    isDev: process.env.NODE_ENV === "development",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    r2PublicBaseUrl: process.env.R2_PUBLIC_BASE_URL,
    r2AccountId: process.env.R2_ACCOUNT_ID,
  });

  // Both halves matter and they are not the same thing. The RESPONSE header is
  // what the browser enforces. The REQUEST header is what Next reads during
  // render to stamp the nonce onto its own inline scripts — without it the RSC
  // payload is blocked and the page never hydrates.
  const response = await updateSession(request, {
    "x-nonce": nonce,
    "content-security-policy": csp,
  });
  response.headers.set("content-security-policy", csp);

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
