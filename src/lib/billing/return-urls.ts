// Where Stripe sends the customer back to.
//
// A pure module rather than two template literals inside the server action,
// because these two URLs were wrong in a way nothing could catch: they pointed
// at `/dashboard/settings`, which is a redirect to
// `/dashboard/settings/accounts` and drops the query string on the way. The
// subscription pane had the "Payment received" and "Checkout canceled" notices
// written and correct — they simply could never render, so a customer who had
// just paid landed on Connected accounts with no confirmation at all.
//
// The rule the test pins: the checkout return path must be a page that reads
// `?checkout=`, never one that redirects.

/** The settings pane that actually renders the checkout outcome. */
export const CHECKOUT_RETURN_PATH = "/dashboard/settings/subscription";

/** Where the portal drops someone when they press Stripe's back link. */
export const PORTAL_RETURN_PATH = "/dashboard/settings/subscription";

/** Strip trailing slashes so `${site}${path}` never doubles them. */
export function normalizeSiteUrl(raw: string | undefined): string {
  return (raw ?? "https://markedfox.com").replace(/\/+$/, "");
}

export function checkoutReturnUrls(site: string): {
  successUrl: string;
  cancelUrl: string;
} {
  const base = normalizeSiteUrl(site);
  return {
    successUrl: `${base}${CHECKOUT_RETURN_PATH}?checkout=success`,
    cancelUrl: `${base}${CHECKOUT_RETURN_PATH}?checkout=canceled`,
  };
}

export function portalReturnUrl(site: string): string {
  return `${normalizeSiteUrl(site)}${PORTAL_RETURN_PATH}`;
}
