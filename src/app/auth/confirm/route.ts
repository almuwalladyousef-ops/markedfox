import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { getSiteUrl } from "@/lib/auth/site-url";
import { safeRedirectPath } from "@/lib/auth/validation";
import { createClient } from "@/lib/supabase/server";

// Landing point for every link Supabase emails: signup confirmation, password
// recovery, and email-change confirmation. Two link shapes arrive here.
//
// `?token_hash=…&type=…` — the link itself carries the single-use hash and we
// verify it server-side. Works from any device, and the token never reaches
// client JavaScript or the browser history. This is the shape the templates in
// supabase/email-templates/ build, pushed by scripts/push-email-templates.mjs.
//
// `?code=…` — what Supabase's DEFAULT templates produce: the email links to
// Supabase's own /verify endpoint, which confirms the token there and redirects
// here with a PKCE code. Exchanging it needs the code verifier cookie the
// sign-up request left in the browser, so it only works in the browser the
// person started from. Handled because Supabase refuses template edits on the
// free tier until a custom SMTP provider is configured — until then, this is
// the only shape that arrives.

const VALID_TYPES: ReadonlySet<string> = new Set([
  "signup",
  "recovery",
  "invite",
  "magiclink",
  "email_change",
  "email",
]);

export async function GET(request: NextRequest) {
  // The public origin, never request.url: behind Caddy the app is reached on
  // 127.0.0.1:3000, so request.url would build localhost links — and these
  // particular redirects are what a user's email client follows.
  const site = await getSiteUrl();
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  // safeRedirectPath keeps a crafted link from bouncing a freshly authenticated
  // user off-site.
  const next = safeRedirectPath(searchParams.get("next"));

  // Supabase's /verify refused the token (expired, already used) and says so
  // in the query instead of sending a code.
  if (searchParams.get("error_code") || searchParams.get("error")) {
    return NextResponse.redirect(
      new URL("/login?error=expired_link", site),
    );
  }

  const code = searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, site));

    // Supabase only issues a code AFTER it has verified the emailed token, so
    // a failed exchange on a sign-up link still means the address is
    // confirmed — the session just could not be handed to this browser (a
    // different device, or the code's flow state timed out). Telling that
    // person their link was invalid is what sent the tester to sign up again.
    // `flow` is set by our own emailRedirectTo and only chooses a message.
    const reason =
      searchParams.get("flow") === "signup"
        ? "confirmed"
        : error.code === "pkce_code_verifier_not_found"
          ? "other_browser"
          : "expired_link";
    return NextResponse.redirect(new URL(`/login?error=${reason}`, site));
  }

  if (!tokenHash || !type || !VALID_TYPES.has(type)) {
    return NextResponse.redirect(
      new URL("/login?error=invalid_link", site),
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
      new URL("/login?error=expired_link", site),
    );
  }

  return NextResponse.redirect(new URL(next, site));
}
