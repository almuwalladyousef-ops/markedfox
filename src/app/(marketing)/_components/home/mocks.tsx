import type { CSSProperties, ReactNode } from "react";

import { Icon, type IconName } from "@/components/icons";
import { PlatformTile } from "@/components/platform-icon";
import { cx } from "@/components/ui";
import type { Platform } from "@/lib/platforms/types";

// The product, drawn. Every mockup on the landing page is built from these
// rather than from screenshots: a screenshot of a product still in platform
// review dates the moment anything moves, and these say the same thing in
// the app's own shapes — the composer's platform tiles, the rule builder's
// phone, the feed's outlier pill, the Home totals.
//
// They are dark in both themes on purpose (see `.mf-mock` in globals.css):
// they depict a phone and a screen, not the page around them.
//
// Server-safe: no hooks, no state. The one interactive mockup on the page is
// automation-demo.tsx, which composes these.

// ── surfaces ───────────────────────────────────────────────────────────────

/** A dark window: a piece of the dashboard, framed. */
export function Frame({
  title,
  aside,
  children,
  className,
  style,
  pad = true,
}: {
  title?: string;
  /** Something small on the title bar's right: a status, a count. */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** true = the default padding, a string = your own, false = none. */
  pad?: boolean | string;
}) {
  const padClass = typeof pad === "string" ? pad : pad ? "p-4" : undefined;
  return (
    <div
      style={style}
      className={cx(
        "mf-mock overflow-hidden rounded-2xl border border-[var(--mk-line)] bg-[var(--mk-panel)] shadow-e2",
        className,
      )}
    >
      {title ? (
        <div className="flex items-center justify-between gap-3 border-b border-[var(--mk-line)] px-4 py-2.5">
          <span className="text-[12px] font-semibold text-[var(--mk-muted)]">
            {title}
          </span>
          {aside ? (
            <span className="text-[11.5px] text-[var(--mk-faint)]">{aside}</span>
          ) : null}
        </div>
      ) : null}
      <div className={padClass}>{children}</div>
    </div>
  );
}

/** A phone. The bezel radius is the one deliberate exception to the app's
 *  five corners — a phone drawn with an 18px corner is a card, not a phone. */
export function Phone({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      style={style}
      className={cx(
        "mf-mock w-[248px] overflow-hidden rounded-[34px] border-[6px] border-[#2a2a32] bg-[var(--mk-bg)] shadow-e2",
        className,
      )}
    >
      <div className="flex items-center justify-between px-5 pt-2.5 pb-1 text-[10px] font-semibold text-[var(--mk-faint)]">
        <span>9:41</span>
        <span aria-hidden className="h-[6px] w-[56px] rounded-full bg-[#2a2a32]" />
        <span aria-hidden className="inline-flex items-end gap-[2px]">
          <span className="h-[5px] w-[3px] rounded-[1px] bg-current" />
          <span className="h-[7px] w-[3px] rounded-[1px] bg-current" />
          <span className="h-[9px] w-[3px] rounded-[1px] bg-current" />
        </span>
      </div>
      {children}
    </div>
  );
}

// ── people ─────────────────────────────────────────────────────────────────

const HUES = [
  "linear-gradient(135deg,#f97316,#c2410c)",
  "linear-gradient(135deg,#38bdf8,#0369a1)",
  "linear-gradient(135deg,#4ade80,#15803d)",
  "linear-gradient(135deg,#c084fc,#7e22ce)",
  "linear-gradient(135deg,#fbbf24,#b45309)",
];

/** An initialled circle standing in for a profile picture. No photographs on
 *  this page: every face would be either a stock model or a real person who
 *  never agreed to be here. */
export function Avatar({
  name,
  size = 28,
  hue = 0,
  className,
}: {
  name: string;
  size?: number;
  hue?: number;
  className?: string;
}) {
  const initial = name.replace(/^@/, "").charAt(0).toUpperCase();
  return (
    <span
      aria-hidden
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        background: HUES[hue % HUES.length],
      }}
    >
      {initial}
    </span>
  );
}

// ── chat ───────────────────────────────────────────────────────────────────

/** One message in a DM thread. `business` is the account the rule runs on. */
export function Bubble({
  from,
  children,
  button,
  className,
}: {
  from: "business" | "person";
  children: ReactNode;
  button?: string;
  className?: string;
}) {
  const own = from === "business";
  return (
    <div className={cx("flex", own ? "justify-end" : "justify-start", className)}>
      <div
        className={cx(
          "max-w-[84%] rounded-2xl px-3.5 py-2.5 text-[12.5px]/[17px]",
          own
            ? "rounded-br-md bg-accent text-accent-ink"
            : "rounded-bl-md bg-[var(--mk-chip)] text-[var(--mk-text)]",
        )}
      >
        <span className="text-pretty">{children}</span>
        {button ? (
          <span className="mt-2 block rounded-md bg-[rgba(255,255,255,0.18)] px-3 py-1.5 text-center text-[12px] font-semibold">
            {button}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** A comment under a post, with an optional reply from the account. */
export function Comment({
  name,
  hue = 1,
  children,
  own,
  className,
}: {
  name: string;
  hue?: number;
  children: ReactNode;
  own?: boolean;
  className?: string;
}) {
  return (
    <div className={cx("flex items-start gap-2", className)}>
      <Avatar name={name} size={22} hue={own ? 0 : hue} />
      <p className="text-[12px]/[16px] text-[var(--mk-text)]">
        <span className="mr-1.5 font-semibold text-[var(--mk-muted)]">{name}</span>
        {children}
      </p>
    </div>
  );
}

// ── small parts ────────────────────────────────────────────────────────────

/** A platform's app tile with the word that platform uses for the post kind. */
export function PlatformPick({
  platform,
  label,
  selected = true,
  size = 40,
}: {
  platform: Platform;
  label: string;
  selected?: boolean;
  size?: number;
}) {
  return (
    <span className="inline-flex flex-col items-center gap-1.5">
      <span
        className={cx(
          "rounded-lg p-[3px] transition-colors",
          selected ? "bg-accent" : "bg-transparent",
        )}
      >
        <PlatformTile platform={platform} size={size} />
      </span>
      <span
        className={cx(
          "text-[10.5px] font-medium",
          selected ? "text-[var(--mk-text)]" : "text-[var(--mk-faint)]",
        )}
      >
        {label}
      </span>
    </span>
  );
}

/** The app's switch, in the mock's palette. */
export function MockToggle({ on = true }: { on?: boolean }) {
  return (
    <span
      aria-hidden
      className={cx(
        "relative inline-block h-[20px] w-[34px] shrink-0 rounded-full transition-colors",
        on ? "bg-accent" : "bg-[var(--mk-line)]",
      )}
    >
      <span
        className={cx(
          "absolute top-[2px] h-[16px] w-[16px] rounded-full bg-white shadow-e1",
          on ? "left-[16px]" : "left-[2px]",
        )}
      />
    </span>
  );
}

/** A label over a number, the way Home and the automations list show them. */
export function MockStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-[var(--mk-faint)]">{label}</p>
      <p
        className={cx(
          "font-display mt-0.5 text-[19px] font-bold tracking-[-0.02em] tabular-nums",
          accent ? "text-accent" : "text-[var(--mk-text)]",
        )}
      >
        {value}
      </p>
    </div>
  );
}

/** A row of `MockStat`s separated by hairlines, like `StatRow` in the app. */
export function MockStatRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-y-3 divide-x divide-[var(--mk-line)] [&>*]:px-4 [&>*:first-child]:pl-0 [&>*:last-child]:pr-0">
      {children}
    </div>
  );
}

/** A filter chip on the research feed or the calendar. */
export function Chip({
  children,
  active,
  icon,
}: {
  children: ReactNode;
  active?: boolean;
  icon?: IconName;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap",
        active
          ? "bg-accent-soft text-accent"
          : "bg-[var(--mk-chip)] text-[var(--mk-muted)]",
      )}
    >
      {icon ? <Icon name={icon} className="h-3 w-3" /> : null}
      {children}
    </span>
  );
}

/** The outlier pill the feed puts on every video: the multiple first, then
 *  the tier the app would name it. Colours match the app's tier borders. */
export function OutlierPill({
  multiple,
  tier,
}: {
  multiple: string;
  tier: "validated" | "outlier" | "strong" | "normal" | "under";
}) {
  const tone =
    tier === "validated" || tier === "outlier"
      ? "bg-ok-soft text-ok"
      : tier === "strong"
        ? "bg-sky-soft text-sky"
        : tier === "under"
          ? "bg-warn-soft text-warn"
          : "bg-[var(--mk-chip)] text-[var(--mk-muted)]";
  const label =
    tier === "validated"
      ? "validated outlier"
      : tier === "outlier"
        ? "outlier"
        : tier === "strong"
          ? "strong"
          : tier === "under"
            ? "under baseline"
            : "normal";
  return (
    <span
      className={cx(
        "inline-flex max-w-full items-center gap-1 overflow-hidden rounded-full px-2 py-[3px] text-[10.5px] font-bold whitespace-nowrap",
        tone,
      )}
    >
      <span className="tabular-nums">{multiple}</span>
      <span aria-hidden>·</span>
      {label}
    </span>
  );
}

/** A post in a grid: the first line of its caption on a dark ground, the
 *  platform's mark, and the number that platform actually publishes. */
export function PostTile({
  platform,
  caption,
  metric,
  hue = 0,
  aspect = "aspect-[9/16]",
  className,
}: {
  platform: Platform;
  caption: string;
  metric: string;
  hue?: number;
  aspect?: string;
  className?: string;
}) {
  const grounds = [
    "linear-gradient(160deg,#2a1a12 0%,#141416 65%)",
    "linear-gradient(160deg,#10222c 0%,#141416 65%)",
    "linear-gradient(160deg,#122616 0%,#141416 65%)",
    "linear-gradient(160deg,#241636 0%,#141416 65%)",
    "linear-gradient(160deg,#2b2412 0%,#141416 65%)",
  ];
  return (
    <div
      className={cx(
        "relative flex flex-col justify-between overflow-hidden rounded-lg p-2.5",
        aspect,
        className,
      )}
      style={{ background: grounds[hue % grounds.length] }}
    >
      <span className="self-end">
        <PlatformTile platform={platform} size={18} radius={999} />
      </span>
      <div>
        <p className="line-clamp-3 text-[11px]/[14px] font-semibold text-[var(--mk-text)] text-pretty">
          {caption}
        </p>
        <p className="mt-1 flex items-center gap-1 text-[10.5px] font-semibold text-[var(--mk-muted)] tabular-nums">
          <Icon name="play" className="h-3 w-3" />
          {metric}
        </p>
      </div>
    </div>
  );
}

/** A labelled setting row inside a "Share on …" panel. */
export function SettingRow({
  label,
  value,
  toggle,
}: {
  label: string;
  value?: string;
  toggle?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-[12px]">
      <span className="text-[var(--mk-muted)]">{label}</span>
      {toggle === undefined ? (
        <span className="rounded-md bg-[var(--mk-chip)] px-2 py-1 text-[11.5px] font-semibold text-[var(--mk-text)]">
          {value}
        </span>
      ) : (
        <MockToggle on={toggle} />
      )}
    </div>
  );
}

/** A connected account row, as the accounts screen draws it. */
export function AccountRow({
  platform,
  handle,
  note,
  on = true,
}: {
  platform: Platform;
  handle: string;
  note?: string;
  on?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <PlatformTile platform={platform} size={30} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] font-semibold text-[var(--mk-text)]">
          {handle}
        </p>
        {note ? (
          <p className="truncate text-[11px] text-[var(--mk-faint)]">{note}</p>
        ) : null}
      </div>
      <MockToggle on={on} />
    </div>
  );
}
