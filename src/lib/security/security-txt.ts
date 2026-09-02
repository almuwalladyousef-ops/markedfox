/**
 * RFC 9116 security.txt.
 *
 * The contact is `support@markedfox.com`, which is the address the product
 * already publishes on /privacy and in the dashboard's help pane — this adds
 * no new address and no new inbox to defend. Deliberately NOT the role account
 * `markedfox.usa@gmail.com`: that inbox owns the Meta app, Business
 * Verification, Supabase, the VPS and Cloudflare, and publishing it on a page
 * whose whole audience is people probing the site would be handing out the
 * single most valuable target in the stack.
 *
 * OWNER TODO (Phase 0, still open): Cloudflare Email Routing for
 * admin@/hello@/support@markedfox.com is not configured yet, so mail to this
 * address does not land anywhere. The file is correct and the routing is the
 * missing half — until it exists, a reporter gets a bounce.
 *
 * `Expires` is computed per request rather than written down, because a
 * hardcoded date is a file that silently becomes invalid on a day nobody is
 * watching.
 */

export const SECURITY_CONTACT = "mailto:support@markedfox.com";

/** RFC 9116 requires an expiry under a year out. Half of that, always fresh. */
export const EXPIRY_DAYS = 180;

export function buildSecurityTxt(now: Date, siteUrl = "https://markedfox.com"): string {
  const expires = new Date(now.getTime() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const canonical = new URL("/.well-known/security.txt", siteUrl).toString();

  return [
    "# MarkedFox — security contact",
    "#",
    "# Please report anything that exposes another account's data, tokens or",
    "# posts. Those are people's real social accounts; we would rather hear it",
    "# from you than from them.",
    "",
    `Contact: ${SECURITY_CONTACT}`,
    `Expires: ${expires.toISOString()}`,
    "Preferred-Languages: en",
    `Canonical: ${canonical}`,
    "",
  ].join("\n");
}
