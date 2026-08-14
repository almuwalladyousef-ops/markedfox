import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { safeRedirectPath } from "@/lib/auth/validation";
import { createClient } from "@/lib/supabase/server";

// Landing point for every link Supabase emails: signup confirmation, password
// recovery, and email-change confirmation.
//
// The link carries a single-use token_hash. Exchanging it here — server-side —
// sets the session cookies through the SSR client, so the token never reaches
// client JavaScript and never sits in the browser history as a credential.

const VALID_TYPES: ReadonlySet<string> = new Set([
  "signup",
  "recovery",
  "invite",
  "magiclink",
  "email_change",
  "email",
]);

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  // safeRedirectPath keeps a crafted link from bouncing a freshly authenticated
  // user off-site.
  const next = safeRedirectPath(searchParams.get("next"));

  if (!tokenHash || !type || !VALID_TYPES.has(type)) {
    return NextResponse.redirect(
      new URL("/login?error=invalid_link", request.url),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type: type as EmailOtpType,
    token_hash: tokenHash,
  });

  if (error) {
    // Expired or already-used links land here. The login page explains it
    // rather than showing a raw Supabase error.
    return NextResponse.redirect(
      new URL("/login?error=expired_link", request.url),
    );
  }

  return NextResponse.redirect(new URL(next, request.url));
}
