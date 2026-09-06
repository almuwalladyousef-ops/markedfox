import type { IconName } from "@/components/icons";

// The phone's own navigation map, deliberately separate from `lib/shell.ts`.
//
// Above the `shell` breakpoint the dock navigates between the three *spaces*
// (Home, Automate, Studio) and a contextual rail lists each space's rows. That
// model is wrong on a phone: it costs two taps to reach Drafts, and the rail
// is a horizontal chip strip nobody scrolls. So the phone gets four flat
// destinations plus the create action, in the order the owner's reference
// screenshot uses:
//
//   Home · Automate · [ Create ] · Research · Account
//
// Keeping this list here rather than deriving it from SHELL_SPACES is the
// whole point — desktop keeps its space model untouched, and neither layout
// can silently reshape the other. The routes themselves are the existing
// ones; nothing here invents a page.

export type MobileTabId = "home" | "automate" | "feed" | "account";

export type MobileTab = {
  id: MobileTabId;
  href: string;
  label: string;
  icon: IconName;
  /** The accessible name — every control says what it does in plain words. */
  tip: string;
  /** Paths this tab owns beyond its own href, longest-match style. */
  owns: string[];
};

/** The create action. Not a tab: it is the one control that starts work
 *  rather than reviewing it, and the reference raises it above the bar. */
export const MOBILE_CREATE = {
  href: "/dashboard/new-post",
  label: "New post",
  tip: "New post — the composer",
} as const;

export const MOBILE_TABS: MobileTab[] = [
  {
    id: "home",
    href: "/dashboard",
    label: "Home",
    icon: "home",
    tip: "Home — your accounts and your posts",
    // The two routes in Home's own three-line menu. `/dashboard` itself is
    // matched exactly (see `matches`), so listing these does not make Home
    // light up everywhere — it makes it light up on the pages Home owns.
    owns: ["/dashboard/calendar", "/dashboard/drafts"],
  },
  {
    id: "automate",
    href: "/dashboard/automations",
    label: "Automate",
    icon: "automations",
    tip: "Automate — your DM and comment rules",
    // Drafts held this slot until 2026-09-06. Two reasons for the swap. The DM
    // engine is the thing this product is sold on and it had no tab at all —
    // it was reachable only by opening Account and finding it. And it is a
    // place you check on rather than pass through: is the rule live, how many
    // sends, how many clicks. Drafts is a waypoint on the way to publishing,
    // it is one tap away in Home's menu, and nobody opens the app to look at
    // it.
    owns: ["/dashboard/automations"],
  },
  {
    id: "feed",
    // Straight to Channels, not the feed (owner decision, 2026-09-06). The
    // feed is empty until channels are being watched, so landing there first
    // showed a new person a blank screen and no way to read what to do about
    // it. Channels is where the work starts; the feed is what it produces.
    href: "/dashboard/research/channels",
    label: "Research",
    icon: "search",
    tip: "Research — the channels you watch and what they publish",
    // Every Studio route rides this tab: on a phone research IS the space.
    owns: ["/dashboard/research"],
  },
  {
    id: "account",
    // The settings MENU, not one pane of it. On a phone this tab is the
    // settings app: you land on the list and press into a page. It used to
    // open Connected accounts directly, which meant the list — and everything
    // else in it — was somewhere you could only arrive at by going back.
    href: "/dashboard/settings",
    label: "Account",
    icon: "avatar",
    tip: "Account — profile, connected accounts and billing",
    owns: ["/dashboard/settings"],
  },
];

function matches(pathname: string, href: string): boolean {
  // `/dashboard` is every other route's prefix, so it only ever matches
  // itself. Without this the Home tab would be lit on every screen.
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The tab the current path belongs to, longest match wins so
 *  /dashboard/research/channels lights Feed rather than nothing. Undefined on
 *  paths no tab owns — the composer, which is the raised button and is
 *  deliberately not a tab. */
export function activeMobileTab(pathname: string): MobileTabId | undefined {
  let best: { id: MobileTabId; length: number } | undefined;
  for (const tab of MOBILE_TABS) {
    for (const href of [tab.href, ...tab.owns]) {
      if (!matches(pathname, href)) continue;
      if (!best || href.length > best.length) {
        best = { id: tab.id, length: href.length };
      }
    }
  }
  return best?.id;
}

/** True while the composer is open, which is what raises the create button
 *  into its pressed state without lighting a tab that is not there. */
export function isMobileCreate(pathname: string): boolean {
  return (
    pathname === MOBILE_CREATE.href ||
    pathname.startsWith(`${MOBILE_CREATE.href}/`)
  );
}
