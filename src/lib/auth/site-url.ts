import "server-only";

import { headers } from "next/headers";

// Absolute base URL for links inside emails Supabase sends on our behalf.
//
// Confirmation and password-reset links have to be absolute, and they are
// generated server-side where there is no `window.location`. NEXT_PUBLIC_SITE_URL
// is authoritative in production; the request headers are the development
// fallback so the flows work on localhost with no configuration.
//
// Phase 1 sets NEXT_PUBLIC_SITE_URL to https://markedfox.com on the VPS. Until
// then the header fallback is what runs.
export async function getSiteUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, "");

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const protocol =
    headerList.get("x-forwarded-proto") ??
    (host?.startsWith("localhost") || host?.startsWith("127.0.0.1")
      ? "http"
      : "https");

  if (!host) {
    throw new Error(
      "Cannot determine the site URL: set NEXT_PUBLIC_SITE_URL. " +
        "Auth emails contain absolute links and cannot be built without it.",
    );
  }

  return `${protocol}://${host}`;
}
