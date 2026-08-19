import { NextResponse, type NextRequest } from "next/server";

import { getUser } from "@/lib/auth/session";
import { getSiteUrl } from "@/lib/auth/site-url";
import { PlatformApiError, PlatformAuthError } from "@/lib/platforms/errors";
import { decodeState } from "@/lib/connections/oauth-state";
import { readProviderError } from "@/lib/connections/provider-error";
import { saveConnection } from "@/lib/connections/store";
import { getPlatform } from "@/lib/platforms/registry";
import { PLATFORMS, type Platform } from "@/lib/platforms/types";
import { createClient } from "@/lib/supabase/server";

import { NONCE_COOKIE } from "../start/route";

// Leg 3: the platform redirects back here with a code. Verify our own state,
// exchange the code, store one encrypted connection per account, land on the
// dashboard.
//
// Failure modes all land on /dashboard?connect_error=<reason> — a user mid-
// OAuth has no use for a JSON error body.

function bounce(base: string, query: Record<string, string>) {
  const url = new URL("/dashboard", base);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  const response = NextResponse.redirect(url);
  // One-shot nonce either way: success consumes it, failure invalidates it.
  response.cookies.set(NONCE_COOKIE, "", { path: "/api/connect", maxAge: 0 });
  return response;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> },
) {
  const { platform: platformParam } = await params;
  const site = await getSiteUrl();
  const query = request.nextUrl.searchParams;

  const user = await getUser();
  if (!user) {
    // Session died mid-dance (cookies cleared, or >10 min on the consent
    // screen). Nothing was stored; start over from a signed-in state.
    return NextResponse.redirect(new URL("/login", site));
  }

  if (!(PLATFORMS as readonly string[]).includes(platformParam)) {
    return bounce(site, { connect_error: "unknown_platform" });
  }
  const platform = platformParam as Platform;

  // Checked BEFORE the state check, and deliberately so: a provider that
  // refuses the request never echoes `state`, so testing state first reports
  // `bad_state` and buries the real reason. That cost hours on 2026-08-16,
  // when Facebook was answering "Invalid Scopes: pages_manage_posts".
  const providerError = readProviderError(query);
  if (providerError) {
    if (providerError.kind === "denied") {
      return bounce(site, { connect_error: "denied" });
    }
    console.error(
      `connect ${platformParam} refused by the provider:`,
      query.toString(),
    );
    return bounce(site, {
      connect_error: "provider_error",
      ...(providerError.message
        ? { connect_detail: providerError.message.slice(0, 300) }
        : {}),
    });
  }

  const state = decodeState(
    query.get("state"),
    request.cookies.get(NONCE_COOKIE)?.value,
  );
  if (!state) {
    // Forged, replayed, or expired state — refuse without touching anything.
    return bounce(site, { connect_error: "bad_state" });
  }

  const code = query.get("code");
  if (!code) {
    return bounce(site, { connect_error: "missing_code" });
  }

  try {
    const adapter = getPlatform(platform);
    const result = await adapter.connect({
      code,
      redirectUri: `${site}/api/connect/${platform}/callback`,
      // The raw state string, already verified above. X derives its PKCE
      // code_verifier from it, so the dance stays stateless on our side.
      state: query.get("state") ?? undefined,
    });

    // User-scoped client: RLS enforces that these rows can only land under the
    // signed-in user, whatever the state parameter claimed.
    const supabase = await createClient();
    for (const account of result.accounts) {
      await saveConnection(supabase, {
        userId: user.id,
        workspaceId: state.w,
        platform,
        account,
        tokens: result.tokens,
      });
    }

    return bounce(site, {
      connected: platform,
      accounts: String(result.accounts.length),
    });
  } catch (error) {
    console.error(`connect ${platform} failed:`, error);
    // Platform errors carry a message written for the user (e.g. "none of your
    // Pages has an Instagram account linked"). Pass it through rather than
    // making them read the server log to learn what to fix.
    const detail =
      error instanceof PlatformApiError || error instanceof PlatformAuthError
        ? error.message
        : "";
    return bounce(site, {
      connect_error: "exchange_failed",
      ...(detail ? { connect_detail: detail.slice(0, 300) } : {}),
    });
  }
}
