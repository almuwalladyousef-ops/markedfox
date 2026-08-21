import { NextResponse, type NextRequest } from "next/server";

import { getUser } from "@/lib/auth/session";
import { MissingEnvError } from "@/lib/env";
import { getSiteUrl } from "@/lib/auth/site-url";
import { parseFeatures } from "@/lib/connections/features";
import { encodeState, newNonce } from "@/lib/connections/oauth-state";
import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import { getPlatform } from "@/lib/platforms/registry";
import { PLATFORMS, type Platform } from "@/lib/platforms/types";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/store";

// Leg 1 of connecting a social account: gate on plan, mint signed state, and
// send the user to the platform's consent screen.
//
// GET /api/connect/instagram/start
// GET /api/connect/instagram/start?features=messaging   (adds the DM scopes)

export const NONCE_COOKIE = "mf_oauth_nonce";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> },
) {
  const { platform: platformParam } = await params;

  // Public origin, not request.url — see the note in auth/confirm.
  const site = await getSiteUrl();

  const user = await getUser();
  if (!user) {
    return NextResponse.redirect(
      new URL(`/login?next=${encodeURIComponent(request.nextUrl.pathname)}`, site),
    );
  }

  if (!(PLATFORMS as readonly string[]).includes(platformParam)) {
    return NextResponse.json({ error: "unknown platform" }, { status: 404 });
  }
  const platform = platformParam as Platform;

  let adapter;
  try {
    adapter = getPlatform(platform);
  } catch {
    return NextResponse.json(
      { error: `${platform} is not available yet` },
      { status: 404 },
    );
  }

  // The workspace the user is currently looking at — connections belong to one
  // workspace, and the cap is per workspace.
  const active = await getActiveWorkspace();
  if (!active) {
    return NextResponse.json({ error: "no workspace" }, { status: 500 });
  }
  const workspaceId = active.id;

  // The API-level plan gate — the composer's locked tiles are only the UI echo
  // of this same decision.
  const supabase = await createClient();
  const snapshot = await getEntitlementSnapshot(supabase, user.id, workspaceId);
  const decision = canUserDo(snapshot, { type: "connect_platform", platform });
  if (!decision.allowed) {
    return NextResponse.json(
      { error: decision.reason, code: decision.code },
      { status: 403 },
    );
  }

  const features = parseFeatures(request.nextUrl.searchParams.get("features"));
  if (features.includes("messaging") && !adapter.messaging) {
    return NextResponse.json(
      { error: `${platform} has no DM automation` },
      { status: 404 },
    );
  }

  const nonce = newNonce();
  const state = encodeState({ n: nonce, w: workspaceId, ...(features.length ? { f: features } : {}) });
  const redirectUri = `${site}/api/connect/${platform}/callback`;

  let authorizeUrl: string;
  try {
    authorizeUrl = adapter.getAuthorizeUrl({ redirectUri, state, features });
  } catch (error) {
    if (error instanceof MissingEnvError) {
      // Adapter exists, credentials do not — the owner has not created this
      // platform's developer app yet.
      //
      // The dashboard's toggle for this case explains itself before sending
      // anybody here, but the toggle is a real control now and the composer
      // links straight to this route, so a person CAN arrive. Sending them
      // back to the dashboard with the reason in the URL is the difference
      // between a dead end and an answer — a raw 503 JSON body is neither.
      const back = new URL("/dashboard", site);
      back.searchParams.set("connect_error", "not_configured");
      back.searchParams.set(
        "connect_detail",
        `${platform} needs its developer app and keys added to this deployment before anybody can connect it. Nothing is wrong with your account.`,
      );
      return NextResponse.redirect(back);
    }
    throw error;
  }

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/connect",
    maxAge: 600,
  });
  return response;
}
