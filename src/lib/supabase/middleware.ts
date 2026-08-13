import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

let warnedMissingEnv = false;

// Refreshes the auth session on every matched request so server code always
// sees valid tokens. Persistent sessions are a Phase 2 exit criterion — this
// is the half that keeps refresh tokens rotating.
export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // Pre-Phase-2 leniency, deliberate and time-boxed: with no Supabase env the
  // placeholder site still serves instead of crashing. Phase 2 removes this
  // guard — auth cannot be optional once real users exist.
  if (!url || !key) {
    if (!warnedMissingEnv) {
      warnedMissingEnv = true;
      console.warn(
        "Supabase env vars not set (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY); skipping session refresh. See .env.example.",
      );
    }
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // Revalidates the token with the auth server — never trust getSession() in
  // server code. The call also triggers the refresh-token rotation that keeps
  // sessions persistent.
  await supabase.auth.getClaims();

  return supabaseResponse;
}
