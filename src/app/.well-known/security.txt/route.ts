import { buildSecurityTxt } from "@/lib/security/security-txt";

// GET /.well-known/security.txt — RFC 9116.
//
// A route handler rather than a file in public/, for one reason: the RFC
// requires an `Expires` field, and a date written into a static file goes
// quietly invalid on a day nobody is looking at it. Computed per request it
// cannot.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const body = buildSecurityTxt(
    new Date(),
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://markedfox.com",
  );

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      // Long enough that a scanner is not re-fetching it, short enough that a
      // changed contact reaches people within a day.
      "cache-control": "public, max-age=86400",
    },
  });
}
