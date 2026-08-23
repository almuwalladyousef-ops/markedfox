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
//
// The density here is the single biggest thing that made the app easier to
// read: body type went from a 13.5px floor to 15px, metadata from 11px to
// 13px, card padding from 18px to 22–28px, and the gap between page sections
// from 14px to 22px. Everything below is measured rather than eyeballed.

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
  // A static, already-cropped PNG: next/image would add a loader and a layout
  // wrapper to do nothing here.
  // eslint-disable-next-line @next/next/no-img-element
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
        "rounded-2xl border border-line bg-panel",
        className ?? "px-6 py-[22px]",
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
      <h2 className="font-display text-[16.5px] font-bold tracking-[-0.01em] text-ink">
        {children}
        {hint ? (
          <span className="font-sans text-[13px] font-normal text-faint">
            {" · "}
            {hint}
          </span>
        ) : null}
      </h2>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** The Display heading above a block inside a page — one step below the page
 *  title and one above a card's own title. */
export function SectionHeading({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={cx(
        "font-display text-[18px] font-bold tracking-[-0.01em] text-ink",
        className,
      )}
    >
      {children}
    </h2>
  );
}

/** The small uppercase label above a group. Deliberately tiny and widely
 *  tracked: it is a signpost, not a heading, and at body size it competes
 *  with the content underneath it. */
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
        "text-[10.5px] font-bold tracking-[0.11em] text-faint uppercase",
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
  width = "max-w-[1080px]",
  className,
  children,
}: {
  width?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cx("mx-auto flex w-full flex-col gap-[22px]", width, className)}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  /** `primary` is the 34px title a landing screen wants; `compact` is the
   *  26px one a dense working screen wants. */
  size = "secondary",
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  size?: "primary" | "secondary" | "compact";
}) {
  const heading =
    size === "primary"
      ? "text-[34px]/[40px] tracking-[-0.025em]"
      : size === "compact"
        ? "text-[26px]/[32px] tracking-[-0.02em]"
        : "text-[30px]/[36px] tracking-[-0.025em]";
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className={cx("font-display font-bold text-ink", heading)}>
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-2 max-w-2xl text-[15px]/[24px] text-pretty text-muted">
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

/**
 * A two-pane row — settings menu beside its detail, an idea list beside the
 * idea, a builder beside its preview.
 *
 * This is a wrapping flex row and **not** a grid, and that is the whole point
 * of it existing. `grid-template-columns: 328px minmax(0,1fr)` lets the
 * content track shrink below its own minimum: at around 920px the Ideas title
 * column collapsed to zero width and spilled its text 330px tall, and the
 * Channels card column rendered 203px wide while its cards declared a 240px
 * minimum. A flex row with an explicit floor on each pane cannot do that — it
 * wraps instead.
 */
export function TwoPane({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex flex-wrap items-start gap-[22px]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * A sticky pane inside a `TwoPane`. The stickiness goes on an inner wrapper,
 * never on the flex item: a content-height flex item has no room to move, and
 * that is why the rule-builder preview did not follow the scroll at first.
 */
export function StickyPane({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("self-stretch", className)}>
      <div className="sticky top-6">{children}</div>
    </div>
  );
}

// ── buttons ────────────────────────────────────────────────────────────────

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap transition-[background,color,border-color,filter] duration-150 disabled:cursor-not-allowed disabled:opacity-45";

const BUTTON_TONE = {
  primary: "bg-accent text-accent-ink font-semibold hover:brightness-[1.08]",
  /** The app's one solid ink button: New post, and the primary action of a
   *  flow that ends in publishing. */
  ink: "bg-ink text-panel font-semibold hover:brightness-[1.45]",
  secondary:
    "border border-line bg-panel text-ink font-semibold hover:border-line-strong",
  quiet: "bg-chip text-ink font-semibold hover:brightness-[0.97]",
  ghost: "text-muted font-semibold hover:bg-chip hover:text-ink",
  danger: "border border-danger text-danger font-semibold hover:bg-danger hover:text-white",
} as const;

const BUTTON_SIZE = {
  xs: "rounded-[9px] px-[11px] py-[6px] text-[12.5px]",
  sm: "rounded-[10px] px-[14px] py-[8px] text-[13px]",
  md: "rounded-[11px] px-[18px] py-[11px] text-[14.5px]",
  lg: "rounded-[13px] px-[22px] py-[13px] text-[15px]",
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

/** A square icon-only control: the carousel arrows, the ‹ Today › cluster,
 *  the reorder arrows in settings. Kept at 32px because that is the smallest
 *  square that still clears a comfortable pointer target on a dense row, and
 *  the mobile layouts pad around it to reach 44px. */
export const iconButtonClass =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border border-line bg-panel text-muted transition-[background,color,border-color] duration-150 hover:bg-chip hover:text-ink disabled:cursor-not-allowed disabled:opacity-40";

/** A link or button that reads as text rather than as a control: the "Delete",
 *  "Hide this", "+ Add a follow-up" affordances. */
export const textButtonClass =
  "text-[13px] font-semibold text-accent transition hover:brightness-[1.08] disabled:opacity-45";

export const quietButtonClass =
  "text-[13px] text-faint transition hover:text-ink disabled:opacity-45";

export const destructiveButtonClass =
  "text-[13px] text-faint transition hover:text-danger disabled:opacity-45";

// ── segmented control ──────────────────────────────────────────────────────

/** Track + item classes rather than a component, because the same control is
 *  built from links on the calendar and from buttons in the composer. */
export const segmentedTrack =
  "inline-flex items-center gap-[3px] rounded-[13px] border border-line bg-chip p-[3px]";

export function segmentedItem(selected: boolean, className?: string): string {
  return cx(
    "rounded-[9px] px-[18px] py-2 text-[13.5px] font-semibold transition-[background,color,box-shadow] duration-150",
    selected
      ? "bg-panel text-ink shadow-[0_1px_2px_rgba(24,24,27,.06)]"
      : "text-faint hover:text-ink",
    className,
  );
}

/** The pill row used for filters: the calendar's status tabs, the research
 *  feed's minimum-multiple, the composer's account chips. */
export function chipToggle(selected: boolean, className?: string): string {
  return cx(
    "inline-flex items-center gap-2 rounded-full border-[1.5px] px-[15px] py-[7px] text-[13px] font-semibold transition-[background,color,border-color] duration-150",
    selected
      ? "border-accent bg-accent-soft text-ink"
      : "border-line bg-panel text-muted hover:border-line-strong hover:text-ink",
    className,
  );
}

// ── toggle ─────────────────────────────────────────────────────────────────

/**
 * The on/off switch, 46×26 with a 20px knob. On is success green rather than
 * the accent, because every one of these answers "is this running?" and the
 * accent already means "this is the thing to press".
 *
 * Rendered as a `button` with `role="switch"` rather than a styled checkbox:
 * every caller here toggles through a server action or local state, and the
 * checkbox's own value was never read.
 */
export function Toggle({
  on,
  label,
  onClick,
  disabled,
  className,
  ...rest
}: Omit<ComponentProps<"button">, "onClick"> & {
  on: boolean;
  /** Describes what the switch controls, for anyone not looking at it. */
  label: string;
  onClick?: ComponentProps<"button">["onClick"];
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      {...rest}
      type={rest.type ?? "button"}
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "relative h-[26px] w-[46px] shrink-0 rounded-full transition-[background-color] duration-[180ms] disabled:cursor-not-allowed disabled:opacity-45",
        on ? "bg-ok" : "bg-line hover:bg-line-strong",
        className,
      )}
    >
      <span
        aria-hidden
        className={cx(
          "absolute top-[3px] left-0 h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.22)] transition-transform duration-[180ms]",
          on ? "translate-x-[23px]" : "translate-x-[3px]",
        )}
      />
    </button>
  );
}

/**
 * The same switch as a form's submit button, for the several places a toggle
 * posts a server action rather than moving local state. It is not a client
 * component: pressing it submits the form it sits in, which is what the row
 * around it already is.
 */
export function ToggleForm({
  on,
  label,
  className,
}: {
  on: boolean;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="submit"
      aria-label={label}
      className={cx(
        "relative h-[26px] w-[46px] shrink-0 rounded-full transition-[background-color] duration-[180ms]",
        on ? "bg-ok" : "bg-line hover:bg-line-strong",
        className,
      )}
    >
      <span
        aria-hidden
        className={cx(
          "absolute top-[3px] left-0 h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.22)] transition-transform duration-[180ms]",
          on ? "translate-x-[23px]" : "translate-x-[3px]",
        )}
      />
    </button>
  );
}

// ── inputs ─────────────────────────────────────────────────────────────────

export const inputClass =
  "w-full rounded-[10px] border border-line bg-chip px-3.5 py-[10px] text-[14.5px] text-ink outline-none transition-[border-color] duration-150 placeholder:text-faint focus:border-accent";

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
      <span className="text-[13px] font-semibold text-muted">{label}</span>
      <div className="mt-2">{children}</div>
      {hint ? (
        <p className="mt-1.5 text-[12.5px]/[18px] text-pretty text-faint">
          {hint}
        </p>
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
    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-[4px] text-[11.5px] font-bold whitespace-nowrap",
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
        "rounded-xl border px-4 py-3 text-[13.5px]/[20px] text-pretty",
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
    <div className="rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center">
      <FoxMark className="mx-auto mb-4 h-7 opacity-70" />
      <p className="font-display text-[16px] font-bold text-ink">{title}</p>
      {children ? (
        <p className="mx-auto mt-2 max-w-md text-[14px]/[21px] text-pretty text-muted">
          {children}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
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
    <div className="rounded-xl bg-chip px-4 py-3">
      <dt className="text-[12.5px] text-faint" title={note}>
        {label}
      </dt>
      <dd className="font-display mt-1 text-[22px] font-bold tracking-[-0.02em] text-ink">
        {value}
      </dd>
      {note ? (
        <p className="mt-1 text-[11.5px]/[16px] text-pretty text-faint">
          {note}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A usage meter: the number against its limit, the bar, and a plain-English
 * note about what the limit means. An unlimited entry gets a "No cap" chip
 * rather than a full bar — a bar at 100% and a bar with no ceiling look
 * identical, and they mean opposite things.
 */
export function Meter({
  label,
  used,
  limit,
  note,
}: {
  label: string;
  used: number;
  /** null is unlimited. */
  limit: number | null;
  note?: string;
}) {
  const pct =
    limit === null || limit === 0
      ? null
      : Math.min(100, Math.round((used / limit) * 100));
  const atLimit = pct !== null && pct >= 100;
  return (
    <div>
      <p className="text-[12.5px] text-faint">{label}</p>
      <p className="font-display mt-1 text-[22px] font-bold tracking-[-0.02em] text-ink">
        {formatCount(used)}
        {limit === null ? null : (
          <span className="text-[13px] font-semibold text-faint">
            {" / "}
            {formatCount(limit)}
          </span>
        )}
      </p>
      <div className="mt-2.5">
        {pct === null ? (
          <Pill tone="neutral">No cap</Pill>
        ) : (
          <div className="h-1 w-full overflow-hidden rounded-full bg-chip">
            <div
              className={cx(
                "h-full rounded-full transition-[width] duration-150",
                atLimit ? "bg-warn" : "bg-accent",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>
      {note ? (
        <p className="mt-2 text-[12.5px]/[18px] text-pretty text-faint">
          {note}
        </p>
      ) : null}
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
  const pill = "rounded-lg px-2 py-[3px] text-[11.5px] font-bold";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {score ? (
        <Pill
          tone="ok"
          className={pill}
          title="Multiple of this channel's own median"
        >
          ↗ {score}
        </Pill>
      ) : null}
      <Pill tone="info" className={pill} title={viewsLabel}>
        ◎ {formatCount(views)}
      </Pill>
      {engagement !== null ? (
        <Pill
          tone="warn"
          className={pill}
          title="Likes plus comments, over views"
        >
          ✳ {Math.round(engagement * 100)}%
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
        "inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-md border border-line-strong bg-chip px-1.5 font-sans text-[11.5px] font-bold text-faint",
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
 * or the word "Locked". It renders, it wears the plan diamond, and pressing it
 * explains what the upgrade buys.
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
    <div className="rounded-2xl border border-warn bg-warn-soft px-7 py-6">
      <p className="font-display flex items-center gap-2 text-[16px] font-bold text-warn">
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3" aria-hidden>
          <path d="M12 2 22 9l-10 13L2 9Z" />
        </svg>
        {title}
      </p>
      <div className="mt-2.5 text-[14.5px]/[22px] text-pretty text-ink">
        {children}
      </div>
      {reason ? (
        <p className="mt-3 text-[13px]/[19px] text-pretty text-muted">{reason}</p>
      ) : null}
      <ButtonLink href="/pricing" tone="primary" className="mt-5">
        {cta}
      </ButtonLink>
    </div>
  );
}
