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
