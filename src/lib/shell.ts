import type { IconName } from "@/components/icons";

// The shell's map: three spaces, each owning the rows that used to live in
// one thirteen-row sidebar. The dock navigates between spaces; the contextual
// rail shows only the current space's rows, so nothing is ever more than one
// level deep.
//
// Routes did not change with the redesign — a space button goes to its first
// row's existing route, and the rail highlights by the same longest-match rule
// the old sidebar used.

export type ShellRowItem = {
  href: string;
  label: string;
  icon: IconName;
  /** The hover label — every control says what it does in plain words. */
  tip: string;
};

export type ShellRow = { heading: string } | ShellRowItem;

export type ShellSpaceId = "home" | "automate" | "studio";

export type ShellSpace = {
  id: ShellSpaceId;
  label: string;
  icon: IconName;
  tip: string;
  title: string;
  sub: string;
  rows: ShellRow[];
};

export function isRowItem(row: ShellRow): row is ShellRowItem {
  return "href" in row;
}

export const SHELL_SPACES: ShellSpace[] = [
  {
    id: "home",
    label: "Home",
    icon: "home",
    tip: "Home — your accounts and what's going out",
    title: "Home",
    sub: "Accounts, calendar and drafts",
    rows: [
      {
        href: "/dashboard",
        label: "Overview",
        icon: "home",
        tip: "Your accounts, numbers and latest posts",
      },
      { heading: "Publish" },
      {
        href: "/dashboard/calendar",
        label: "Calendar",
        icon: "calendar",
        tip: "The schedule — month, week and day",
      },
      {
        href: "/dashboard/drafts",
        label: "Drafts",
        icon: "drafts",
        tip: "Posts started but not scheduled",
      },
    ],
  },
  {
    id: "automate",
    label: "Automate",
    icon: "automations",
    tip: "Automate — DM and comment rules",
    title: "Automate",
    sub: "DM & comment engine",
    rows: [
      {
        href: "/dashboard/automations",
        label: "Automations",
        icon: "automations",
        tip: "Your DM and comment rules",
      },
      {
        href: "/dashboard/automations/templates",
        label: "Templates",
        icon: "templates",
        tip: "Ready-made automations to start from",
      },
    ],
  },
  {
    id: "studio",
    label: "Studio",
    icon: "videos",
    tip: "Studio — research, ideas and scripts",
    title: "Studio",
    sub: "Research → script → post",
    rows: [
      {
        href: "/dashboard/research",
        label: "Videos",
        icon: "videos",
        tip: "Outlier videos from watched channels",
      },
      {
        href: "/dashboard/research/ideas",
        label: "Ideas",
        icon: "ideas",
        tip: "Saved outliers waiting for a yes or no",
      },
      {
        href: "/dashboard/research/scripts",
        label: "Scripts",
        icon: "scripts",
        tip: "Scripts drafted from outliers",
      },
      {
        href: "/dashboard/research/projects",
        label: "Projects",
        icon: "projects",
        tip: "Group scripts and ideas by campaign",
      },
      {
        href: "/dashboard/research/hooks",
        label: "Hooks",
        icon: "hooks",
        tip: "Opening lines generated from winners",
      },
      { heading: "Setup" },
      {
        href: "/dashboard/research/channels",
        label: "Channels",
        icon: "channels",
        tip: "The channels Studio watches",
      },
      {
        href: "/dashboard/research/persona",
        label: "Persona",
        icon: "persona",
        tip: "Who your content is written for",
      },
      {
        href: "/dashboard/research/rules",
        label: "Auto-analyze",
        icon: "autoanalyze",
        tip: "Scheduled sweeps that flag outliers",
      },
    ],
  },
];

function matches(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The row the current path belongs to — longest match wins, so
 *  /dashboard/research/projects lights Projects and not Videos, whose href is
 *  a prefix of it. Undefined on paths no row owns (settings, new-post). */
export function activeRowHref(pathname: string): string | undefined {
  return SHELL_SPACES.flatMap((space) => space.rows)
    .filter(isRowItem)
    .map((row) => row.href)
    .filter((href) => matches(pathname, href))
    .sort((a, b) => b.length - a.length)[0];
}

/** The space the current path belongs to. Paths no row owns (settings,
 *  new-post) fall back to Home — the dock still needs a rail beside it. */
export function activeSpace(pathname: string): ShellSpace {
  const href = activeRowHref(pathname);
  return (
    SHELL_SPACES.find((space) =>
      space.rows.some((row) => isRowItem(row) && row.href === href),
    ) ?? SHELL_SPACES[0]
  );
}

// ── the mobile bottom bar ──────────────────────────────────────────────────
//
// Below `shell` (880px) the dock and the contextual rail are gone and this
// five-destination bar replaces them, in the order the owner's reference
// screenshot uses: Home · Drafts · Create · Feed · Account.
//
// It is deliberately NOT the three-space map above. The dock navigates the
// app by area, which is right beside a rail that lists each area's rows; a
// phone has no rail, so its bar navigates to the five surfaces somebody
// actually opens, and everything else is reached from inside them. That is
// why Drafts is a destination here and a row there, and why Automations is a
// chip under Home rather than a tab of its own — a five-tab bar is the most a
// 375px screen holds at a 44px target, and the DM rules are not something a
// person opens between two other things.
//
// The fourth destination replaces the reference's overlapping-circles button
// outright: it is the research and channels feed, a vertical scroll of cards.

export type MobileTabId = "home" | "drafts" | "create" | "feed" | "account";

export type MobileTab = {
  id: MobileTabId;
  label: string;
  href: string;
  icon: IconName;
  tip: string;
  /** The bar's raised centre control rather than an equal tab. */
  primary?: boolean;
  /** Paths this destination owns beyond its own href. A detail page opened
   *  from a tab keeps that tab lit — tapping a card in the feed and landing
   *  on the breakdown must not move the highlight to Home. */
  owns?: string[];
};

/** Where the feed destination lives. Its own route rather than the desktop
 *  research grid: the same rows, laid out as one column of full-width cards. */
export const MOBILE_FEED_HREF = "/dashboard/feed";

export const MOBILE_TABS: MobileTab[] = [
  {
    id: "home",
    label: "Home",
    href: "/dashboard",
    icon: "home",
    tip: "Home — your accounts and your posts",
    owns: ["/dashboard/calendar", "/dashboard/automations"],
  },
  {
    id: "drafts",
    label: "Drafts",
    href: "/dashboard/drafts",
    icon: "drafts",
    tip: "Drafts — posts started but not scheduled",
  },
  {
    id: "create",
    label: "New post",
    href: "/dashboard/new-post",
    icon: "plus",
    tip: "New post — the composer",
    primary: true,
  },
  {
    id: "feed",
    label: "Feed",
    href: MOBILE_FEED_HREF,
    icon: "channels",
    tip: "Feed — outlier videos from the channels you watch",
    owns: ["/dashboard/research"],
  },
  {
    id: "account",
    label: "Account",
    href: "/dashboard/settings",
    icon: "avatar",
    tip: "Account — your profile, plan and connected accounts",
  },
];

/** One chip in the mobile top bar: where the rows of the destination the user
 *  is in go, now that there is no rail to hold them. */
export type MobileChip = { href: string; label: string };

// Home carries the publishing rows and the DM engine, because those are the
// two things a person moves between while posting. The feed carries Studio's
// own rows. Drafts, New post and Account are single surfaces and show none —
// a chip row with one chip in it is a label pretending to be navigation.
export const MOBILE_TAB_CHIPS: Record<MobileTabId, MobileChip[]> = {
  home: [
    { href: "/dashboard", label: "Overview" },
    { href: "/dashboard/calendar", label: "Calendar" },
    { href: "/dashboard/automations", label: "Automations" },
    { href: "/dashboard/automations/templates", label: "Templates" },
  ],
  drafts: [],
  create: [],
  feed: [
    { href: MOBILE_FEED_HREF, label: "Feed" },
    { href: "/dashboard/research/ideas", label: "Ideas" },
    { href: "/dashboard/research/scripts", label: "Scripts" },
    { href: "/dashboard/research/hooks", label: "Hooks" },
    { href: "/dashboard/research/projects", label: "Projects" },
    { href: "/dashboard/research/channels", label: "Channels" },
    { href: "/dashboard/research/persona", label: "Persona" },
    { href: "/dashboard/research/rules", label: "Auto-analyze" },
  ],
  account: [],
};

/** The destination the current path belongs to. Longest match wins, so
 *  /dashboard/research/ideas lights Feed rather than Home, and an unowned
 *  path (a settings pane, a one-off screen) falls back to Home exactly as
 *  the desktop rail does. */
export function activeMobileTab(pathname: string): MobileTab {
  let best: { tab: MobileTab; length: number } | undefined;
  for (const tab of MOBILE_TABS) {
    for (const href of [tab.href, ...(tab.owns ?? [])]) {
      if (!matches(pathname, href)) continue;
      if (!best || href.length > best.length) best = { tab, length: href.length };
    }
  }
  return best?.tab ?? MOBILE_TABS[0];
}

/** The chip the current path lights, by the same longest-match rule. */
export function activeMobileChip(pathname: string): string | undefined {
  return MOBILE_TAB_CHIPS[activeMobileTab(pathname).id]
    .map((chip) => chip.href)
    .filter((href) => matches(pathname, href))
    .sort((a, b) => b.length - a.length)[0];
}
