import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

// The shared vocabulary. Before this file the dashboard had two visual
// dialects — the publisher's `rounded-md border-neutral-900` one and the
// research pages' `rounded-xl border-neutral-800` one — and the on/off toggle
// was written from scratch three times. Neither is a bug on its own; together
// they make every new page a coin flip about which dialect to copy.
//
// These are plain functions over Tailwind strings rather than a component
// library. Nothing here manages state, and every one of them accepts a
// className so a caller can still do something local without forking.
//
// Every colour goes through the token utilities defined in globals.css
// (`bg-panel`, `border-line`, `text-muted`, …) so both themes come out of one
// set of class names.

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// ── brand ──────────────────────────────────────────────────────────────────

/** The fox mark. Sized by height; the file is tightly cropped so there is no
 *  wrapper to fight with. */
export function FoxMark({
  className = "h-7",
  alt = "",
}: {
  className?: string;
  alt?: string;
}) {
  // eslint-disable-next-line @next/next/no-img-element -- a static, already
  // optimised PNG; next/image would add a loader for no gain.
  return <img src="/logo.png" alt={alt} className={cx("w-auto", className)} />;
}

// ── surfaces ───────────────────────────────────────────────────────────────

export function Card({
  className,
  children,
  ...rest
}: ComponentProps<"section">) {
  return (
    <section
      {...rest}
      className={cx(
        "rounded-[14px] border border-line bg-panel",
        className ?? "p-[18px]",
      )}
    >
      {children}
    </section>
  );
}

export function CardTitle({
  children,
  hint,
  action,
}: {
  children: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <h2 className="text-sm font-semibold text-ink">
        {children}
        {hint ? (
          <span className="font-normal text-faint"> · {hint}</span>
        ) : null}
      </h2>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** The uppercase label above a section of a card. */
export function Eyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cx(
        "text-[13px] font-semibold tracking-[0.04em] text-muted uppercase",
        className,
      )}
    >
      {children}
    </p>
  );
}

/**
 * The per-page column. The shell owns padding and the mobile tab-bar gutter;
 * each page owns how wide its content wants to be, because a settings form and
 * a month calendar do not read well at the same measure.
 */
export function Page({
  width = "max-w-[980px]",
  className,
  children,
}: {
  width?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx("mx-auto flex w-full flex-col gap-3.5", width, className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-[26px]/[32px] font-bold tracking-[-0.02em] text-ink">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1.5 max-w-2xl text-[13.5px]/[20px] text-muted">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  );
}

// ── buttons ────────────────────────────────────────────────────────────────

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-1.5 transition disabled:cursor-not-allowed disabled:opacity-45";

const BUTTON_TONE = {
  primary: "bg-accent text-accent-ink font-semibold hover:brightness-[1.08]",
  secondary:
    "border border-line-strong bg-panel text-ink hover:border-accent hover:text-accent",
  ghost: "text-muted hover:bg-chip hover:text-ink",
  danger:
    "border border-danger text-danger hover:bg-danger hover:text-white",
} as const;

const BUTTON_SIZE = {
  sm: "rounded-lg px-[13px] py-2 text-[12.5px] font-medium",
  md: "rounded-[10px] px-5 py-[11px] text-sm font-medium",
} as const;

export type ButtonTone = keyof typeof BUTTON_TONE;

export function buttonClass(
  tone: ButtonTone = "secondary",
  size: keyof typeof BUTTON_SIZE = "md",
  className?: string,
): string {
  return cx(BUTTON_BASE, BUTTON_TONE[tone], BUTTON_SIZE[size], className);
}

export function Button({
  tone = "secondary",
  size = "md",
  className,
  ...rest
}: ComponentProps<"button"> & {
  tone?: ButtonTone;
  size?: keyof typeof BUTTON_SIZE;
}) {
  return <button {...rest} className={buttonClass(tone, size, className)} />;
}

export function ButtonLink({
  tone = "secondary",
  size = "md",
  className,
  ...rest
}: ComponentProps<typeof Link> & {
  tone?: ButtonTone;
  size?: keyof typeof BUTTON_SIZE;
}) {
  return <Link {...rest} className={buttonClass(tone, size, className)} />;
}

/** A link or button that reads as text rather than as a control: the "Delete",
 *  "Hide this", "+ Add a follow-up" affordances. */
export const textButtonClass =
  "text-xs font-medium text-accent transition hover:brightness-[1.08] disabled:opacity-45";

export const quietButtonClass =
  "text-[11.5px] text-faint transition hover:text-ink disabled:opacity-45";

export const destructiveButtonClass =
  "text-[11.5px] text-faint transition hover:text-danger disabled:opacity-45";

// ── segmented control ──────────────────────────────────────────────────────

/** Track + item classes rather than a component, because the same control is
 *  built from links on the calendar and from buttons in the composer. */
export const segmentedTrack =
  "inline-flex items-center gap-0.5 rounded-[10px] border border-line bg-chip p-[3px]";

export function segmentedItem(selected: boolean, className?: string): string {
  return cx(
    "rounded-lg px-3.5 py-[7px] text-[12.5px] font-semibold transition",
    selected ? "bg-panel text-ink" : "text-faint hover:text-ink",
    className,
  );
}

/** The pill row used for filters: Posts' status tabs, the research feed's
 *  minimum-multiple, Compose's account chips. */
export function chipToggle(selected: boolean, className?: string): string {
  return cx(
    "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-[7px] text-[12.5px] font-semibold transition",
    selected
      ? "border-accent bg-accent-soft text-accent"
      : "border-line text-muted hover:border-line-strong hover:text-ink",
    className,
  );
}

// ── inputs ─────────────────────────────────────────────────────────────────

export const inputClass =
  "w-full rounded-[10px] border border-line bg-chip px-3 py-[9px] text-[13.5px] text-ink outline-none transition placeholder:text-faint focus:border-accent";

export function Field({
  label,
  hint,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-muted">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint ? (
        <p className="mt-1 text-[11.5px]/[17px] text-faint">{hint}</p>
      ) : null}
    </label>
  );
}

// ── status and tone ────────────────────────────────────────────────────────

const PILL_TONE = {
  neutral: "bg-chip text-muted",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  info: "bg-sky-soft text-sky",
  accent: "bg-accent-soft text-accent",
} as const;

export type PillTone = keyof typeof PILL_TONE;

export function pillClass(tone: PillTone = "neutral", className?: string) {
  return cx(
    "inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[11px] font-semibold whitespace-nowrap",
    PILL_TONE[tone],
    className,
  );
}

export function Pill({
  tone = "neutral",
  className,
  children,
  title,
}: {
  tone?: PillTone;
  className?: string;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span title={title} className={pillClass(tone, className)}>
      {children}
    </span>
  );
}

const NOTICE_TONE: Record<PillTone, string> = {
  neutral: "border-line bg-panel text-muted",
  ok: "border-ok bg-ok-soft text-ok",
  warn: "border-warn bg-warn-soft text-warn",
  danger: "border-danger bg-danger-soft text-danger",
  info: "border-sky bg-sky-soft text-sky",
  accent: "border-accent bg-accent-soft text-accent",
};

export function Notice({
  tone = "neutral",
  children,
  className,
}: {
  tone?: PillTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "rounded-xl border px-3.5 py-2.5 text-[12.5px]/[18px]",
        NOTICE_TONE[tone],
        className,
      )}
    >
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[14px] border border-dashed border-line-strong px-6 py-10 text-center">
      <FoxMark className="mx-auto mb-3 h-6 opacity-70" />
      <p className="text-[13.5px] font-semibold text-ink">{title}</p>
      {children ? (
        <p className="mx-auto mt-1.5 max-w-md text-[12.5px]/[18px] text-muted">
          {children}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

// ── numbers ────────────────────────────────────────────────────────────────

/** 1_600_000 → "1.6M". The one number format used everywhere. */
export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `${m >= 10 ? Math.round(m) : m.toFixed(1)}M`;
  }
  if (value >= 1_000) {
    const k = value / 1_000;
    return `${k >= 10 ? Math.round(k) : k.toFixed(1)}K`;
  }
  return String(value);
}

export function Stat({
  label,
  value,
  note,
}: {
  label: ReactNode;
  value: ReactNode;
  note?: string;
}) {
  return (
    <div className="rounded-[10px] bg-chip px-3 py-2.5">
      <dt className="text-[11px] text-faint" title={note}>
        {label}
      </dt>
      <dd className="font-display mt-0.5 text-[17px] font-semibold text-ink">
        {value}
      </dd>
      {note ? <p className="mt-0.5 text-[10px] text-faint">{note}</p> : null}
    </div>
  );
}

/**
 * The three numbers that describe a researched video, in the order they
 * matter: how far it beat its own channel, how many people saw it, how many
 * of them did something. Rendered identically on feed cards, idea rows and
 * detail headers so one glance means the same thing everywhere.
 */
export function MetricPills({
  score,
  views,
  engagement,
  viewsLabel = "views",
}: {
  score: string | null;
  views: number | null;
  engagement: number | null;
  viewsLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {score ? (
        <Pill
          tone="ok"
          className="text-[10px] font-bold"
          title="Multiple of this channel's own median"
        >
          {score}
        </Pill>
      ) : null}
      <Pill tone="neutral" className="text-[10px]" title={viewsLabel}>
        ◎ {formatCount(views)}
      </Pill>
      {engagement !== null ? (
        <Pill
          tone="neutral"
          className="text-[10px]"
          title="Likes plus comments, over views"
        >
          {Math.round(engagement * 100)}% eng
        </Pill>
      ) : null}
    </div>
  );
}

// ── keyboard affordances ───────────────────────────────────────────────────

/** A key cap, e.g. the "S" beside "Shortlist". */
export function Kbd({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <kbd
      className={cx(
        "rounded border border-b-2 border-line-strong bg-chip px-1 py-px font-sans text-[10px] text-faint",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

// ── plan gating ────────────────────────────────────────────────────────────

/**
 * The house rule made reusable: a feature outside the plan is never a dead row
 * or the word "Locked". It renders, it wears a 💎, and pressing it explains
 * what the upgrade buys.
 */
export function UpgradeCard({
  title,
  children,
  reason,
  cta = "See plans",
}: {
  title: string;
  children: ReactNode;
  reason?: string;
  cta?: string;
}) {
  return (
    <div className="rounded-[14px] border border-warn bg-warn-soft p-6">
      <p className="text-sm font-semibold text-warn">💎 {title}</p>
      <div className="mt-2 text-[13.5px]/[20px] text-ink">{children}</div>
      {reason ? (
        <p className="mt-3 text-[11.5px] text-muted">{reason}</p>
      ) : null}
      <ButtonLink href="/pricing" tone="primary" className="mt-5">
        {cta}
      </ButtonLink>
    </div>
  );
}
