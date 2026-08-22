import { cx } from "@/components/ui";

// The icon set. Before this file the nav and the settings menu were drawn with
// text glyphs — ✎ ▤ ⚡ ◇ ⊕ — which is a font's opinion of a symbol rather than
// ours: the weights never matched the type around them, several had no
// sensible dark-mode rendering, and two of them fell back to a box on
// Android. These are 24×24 stroke paths instead, so they inherit currentColor
// and scale to any size in the layout without a second asset.
//
// Every icon is authored on the same grid with the same stroke width, which is
// the part that makes a set read as a set.

export type IconName =
  // nav
  | "home"
  | "calendar"
  | "drafts"
  | "automations"
  | "templates"
  | "videos"
  | "ideas"
  | "hooks"
  | "scripts"
  | "projects"
  | "channels"
  | "persona"
  | "autoanalyze"
  // settings menu
  | "link"
  | "people"
  | "grid"
  | "play"
  | "shield"
  | "mail"
  | "avatar"
  | "question"
  | "chat"
  | "bang"
  | "card"
  | "user"
  | "chart"
  | "doc"
  | "paint"
  // controls
  | "plus"
  | "panel"
  | "chevronLeft"
  | "chevronRight"
  | "chevronDown"
  | "chevronUp"
  | "check"
  | "close"
  | "search"
  | "refresh"
  | "filter"
  | "sort"
  | "export"
  | "trash"
  | "image"
  | "info"
  | "eye"
  | "spark"
  | "arrowLeft"
  | "arrowRight"
  | "arrowUp"
  | "arrowDown"
  | "settings"
  | "logout"
  | "external";

const PATHS: Record<IconName, string[]> = {
  home: ["m3 10.5 9-7.5 9 7.5", "M5.5 9.5V20h13V9.5", "M9.75 20v-6h4.5v6"],
  calendar: ["M3 4.5h18v16.5H3z", "M8 2.5v4M16 2.5v4M3 10h18"],
  drafts: [
    "M14 3v5h5",
    "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z",
    "M8 13h8M8 17h5",
  ],
  automations: ["M13 2 4 14h7l-1 8 9-12h-7Z"],
  templates: [
    "M3 3h7.5v7.5H3zM13.5 3H21v7.5h-7.5zM3 13.5h7.5V21H3zM13.5 13.5H21V21h-7.5z",
  ],
  videos: [
    "M20.5 12a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0Z",
    "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  ],
  ideas: [
    "M9.5 18.5h5M10.5 21.5h3",
    "M12 2.5a6.5 6.5 0 0 0-3.7 11.8v1.7h7.4v-1.7A6.5 6.5 0 0 0 12 2.5Z",
  ],
  hooks: ["M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"],
  scripts: ["M4 20.5h16", "M4 16.5 15.5 5a2.1 2.1 0 0 1 3 3L7 19.5H4Z"],
  projects: [
    "M3 7.5A2 2 0 0 1 5 5.5h3.6L11 8.2h8a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z",
  ],
  channels: [
    "M20.5 12a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0Z",
    "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  ],
  persona: [
    "M12 11.6a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6Z",
    "M4.6 20.5a7.4 7.4 0 0 1 14.8 0",
  ],
  autoanalyze: [
    "M20.5 12a8.5 8.5 0 1 1-2.5-6",
    "M20.5 4v4.5H16",
    "M9 13.5l2.5-3 2 2.2 2.5-3.2",
  ],
  link: [
    "M10 13a5 5 0 0 0 7.1 0l2.4-2.4a5 5 0 0 0-7.1-7.1L11 4.9",
    "M14 11a5 5 0 0 0-7.1 0L4.5 13.4a5 5 0 0 0 7.1 7.1l1.4-1.4",
  ],
  people: [
    "M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z",
    "M2.5 20a6.5 6.5 0 0 1 13 0",
    "M17 8.5h4M19 6.5v4",
  ],
  grid: ["M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"],
  play: ["M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z", "M10.2 8.6 16 12l-5.8 3.4Z"],
  shield: [
    "M12 2.5 20 5.5v6c0 5-3.4 8.4-8 10.1-4.6-1.7-8-5.1-8-10.1v-6Z",
    "M12 11.2v3",
    "M12 8.9h.01",
  ],
  mail: ["M3 6h18v12H3z", "m3.5 6.8 8.5 6 8.5-6"],
  avatar: [
    "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
    "M12 12.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
    "M6.2 19a6.4 6.4 0 0 1 11.6 0",
  ],
  question: [
    "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
    "M9.6 9.3A2.5 2.5 0 0 1 14.5 10c0 1.7-2.5 2-2.5 3.6",
    "M12 17h.01",
  ],
  chat: [
    "M20.5 12.5c0 4-3.8 7-8.5 7-1 0-2-.15-2.9-.4L4 21l1.4-3.4A6.7 6.7 0 0 1 3.5 12.5c0-3.9 3.8-7 8.5-7s8.5 3.1 8.5 7Z",
  ],
  bang: ["M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z", "M12 7.5v5", "M12 16h.01"],
  card: ["M3 6h18v12H3z", "M3 10h18", "M6.5 14.5h3"],
  user: [
    "M12 11.5a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6Z",
    "M4.5 20.5a7.5 7.5 0 0 1 15 0",
  ],
  chart: ["M4 4h16v16H4z", "M8.5 15.5v-3M12 15.5v-6M15.5 15.5v-4.5"],
  doc: ["M6 3h9l4 4v14H6z", "M9 12h7M9 16h5M9 8h4"],
  paint: [
    "M12 3a9 9 0 0 0 0 18c1.4 0 2-.9 2-1.8 0-1-.7-1.6-.7-2.4 0-.9.7-1.5 1.7-1.5H17a4 4 0 0 0 4-4C21 6.4 17 3 12 3Z",
    "M7.5 12h.01M10 8.5h.01M14.5 8h.01",
  ],
  plus: ["M12 5v14M5 12h14"],
  // The collapse toggle: a rectangle with its left panel drawn in, so the
  // glyph says which edge is about to move.
  panel: ["M3.5 5h17v14h-17z", "M9.5 5v14"],
  chevronLeft: ["m14.5 5-6 7 6 7"],
  chevronRight: ["m9.5 5 6 7-6 7"],
  chevronDown: ["m5 9.5 7 6 7-6"],
  chevronUp: ["m5 14.5 7-6 7 6"],
  check: ["m4.5 12.5 5 5 10-11"],
  close: ["M5.5 5.5l13 13M18.5 5.5l-13 13"],
  search: ["M18.5 10.75a7.75 7.75 0 1 1-15.5 0 7.75 7.75 0 0 1 15.5 0Z", "m16.5 16.5 4.5 4.5"],
  refresh: ["M20.5 12a8.5 8.5 0 1 1-2.5-6", "M20.5 4v4.5H16"],
  filter: ["M3.5 5.5h17l-6.5 8v6l-4 2v-8Z"],
  sort: ["M7 4v16M7 20l-3-3M7 20l3-3", "M17 20V4M17 4l-3 3M17 4l3 3"],
  export: ["M12 15.5V3.5", "m8 7 4-3.5L16 7", "M4.5 14.5v4a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-4"],
  trash: ["M4 6.5h16", "M9 6.5V4h6v2.5", "M6.5 6.5 7.5 21h9l1-14.5", "M10.5 10.5v6M13.5 10.5v6"],
  image: [
    "M3.5 4.5h17v15h-17z",
    "M9 10a1.6 1.6 0 1 1-3.2 0A1.6 1.6 0 0 1 9 10Z",
    "m3.5 16.5 5-5 4.5 4.5 3-2.5 4.5 4",
  ],
  info: ["M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z", "M12 11v5.5", "M12 7.5h.01"],
  eye: [
    "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z",
    "M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  ],
  spark: ["M12 3v4M12 17v4M3 12h4M17 12h4", "m5.6 5.6 2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"],
  arrowLeft: ["M20 12H4", "m10 6-6 6 6 6"],
  arrowRight: ["M4 12h16", "m14 6 6 6-6 6"],
  arrowUp: ["M12 20V4", "m6 10 6-6 6 6"],
  arrowDown: ["M12 4v16", "m6 14 6 6 6-6"],
  settings: [
    "M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
    "M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z",
  ],
  logout: ["M9.5 20.5H5.5a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2h4", "M16 16.5l4.5-4.5L16 7.5", "M20 12H9"],
  external: ["M14 3.5h6.5V10", "M20.5 3.5 11 13", "M18 14v5.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 19.5v-11A1.5 1.5 0 0 1 5.5 7H11"],
};

export function Icon({
  name,
  className = "h-[18px] w-[18px]",
  strokeWidth = 1.8,
  title,
}: {
  name: IconName;
  className?: string;
  strokeWidth?: number;
  /** Set only when the icon stands alone; omit when a label sits beside it. */
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx("shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/**
 * The mark on anything the plan does not cover. It replaces a 💎 emoji, which
 * rendered as a blue gem on one platform, a grey box on another, and never at
 * the weight of the type beside it.
 */
export function PlanDiamond({
  className = "h-3 w-3",
  title = "Not on your plan",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={cx("shrink-0 text-accent", className)}
      role="img"
    >
      <title>{title}</title>
      <path d="M12 2 22 9l-10 13L2 9Z" />
    </svg>
  );
}
