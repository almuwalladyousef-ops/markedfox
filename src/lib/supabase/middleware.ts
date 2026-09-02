import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

let warnedMissingEnv = false;

/** Headers the proxy wants the render to see — the CSP nonce and the policy
 *  itself. They are rebuilt at each NextResponse.next() rather than captured
 *  once, because request.cookies.set() rewrites the request's own cookie
 *  header and a stale copy would drop a freshly rotated session. */
type ForwardedHeaders = Record<string, string>;

function forward(request: NextRequest, extra: ForwardedHeaders): Headers {
  const headers = new Headers(request.headers);
  for (const [name, value] of Object.entries(extra)) headers.set(name, value);
  return headers;
}

// Refreshes the auth session on every matched request so server code always
// sees valid tokens. Persistent sessions are a Phase 2 exit criterion — this
// is the half that keeps refresh tokens rotating.
export async function updateSession(
  request: NextRequest,
  extraRequestHeaders: ForwardedHeaders = {},
) {
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
    return NextResponse.next({
      request: { headers: forward(request, extraRequestHeaders) },
    });
  }

  let supabaseResponse = NextResponse.next({
    request: { headers: forward(request, extraRequestHeaders) },
  });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({
          request: { headers: forward(request, extraRequestHeaders) },
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // Revalidates the token with the auth server — never trust getSession() in
  // server code. The call also triggers the refresh-token rotation that keeps
  // sessions persistent.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  // Convenience redirect only. The real guard is requireUser() in each
  // protected page, and RLS underneath that — a matcher change here must never
  // be able to expose data.
  if (!signedIn && isProtectedPath(request.nextUrl.pathname)) {
    const loginUrl = new URL("/login", request.url);
    // Round-trips the user back to where they were headed after signing in.
    loginUrl.searchParams.set(
      "next",
      request.nextUrl.pathname + request.nextUrl.search,
    );
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}

// Prefix-matched so future sections are covered by adding one entry. Anything
// not listed is public.
const PROTECTED_PREFIXES = ["/dashboard"];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
