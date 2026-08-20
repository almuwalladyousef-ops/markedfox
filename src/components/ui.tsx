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

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
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
        "rounded-xl border border-neutral-800 bg-neutral-950/60",
        className ?? "p-5",
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
      <div>
        <h2 className="text-sm font-semibold text-neutral-100">{children}</h2>
        {hint ? <p className="mt-1 text-xs text-neutral-500">{hint}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
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
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? (
          <p className="mt-1 max-w-2xl text-sm text-neutral-400">{subtitle}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

// ── buttons ────────────────────────────────────────────────────────────────

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50";

const BUTTON_TONE = {
  primary: "bg-white text-black hover:bg-neutral-200",
  secondary:
    "border border-neutral-800 text-neutral-300 hover:border-neutral-600 hover:text-neutral-50",
  ghost: "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100",
  danger:
    "border border-red-900/70 text-red-300 hover:border-red-700 hover:bg-red-950/40",
} as const;

const BUTTON_SIZE = {
  sm: "px-2.5 py-1.5 text-xs",
  md: "px-4 py-2",
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

// ── inputs ─────────────────────────────────────────────────────────────────

export const inputClass =
  "w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-600 focus:border-neutral-600";

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
      <span className="text-xs font-medium text-neutral-400">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint ? <p className="mt-1 text-xs text-neutral-600">{hint}</p> : null}
    </label>
  );
}

// ── status and tone ────────────────────────────────────────────────────────

const PILL_TONE = {
  neutral: "border-neutral-700 bg-neutral-900 text-neutral-400",
  ok: "border-emerald-700/70 bg-emerald-950/40 text-emerald-300",
  warn: "border-amber-800/70 bg-amber-950/30 text-amber-300",
  danger: "border-red-800/70 bg-red-950/40 text-red-300",
  info: "border-sky-800/70 bg-sky-950/40 text-sky-300",
  accent: "border-fuchsia-800/70 bg-fuchsia-950/30 text-fuchsia-300",
} as const;

export type PillTone = keyof typeof PILL_TONE;

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
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap",
        PILL_TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Notice({
  tone = "neutral",
  children,
}: {
  tone?: PillTone;
  children: ReactNode;
}) {
  const map: Record<PillTone, string> = {
    neutral: "border-neutral-800 bg-neutral-900/60 text-neutral-300",
    ok: "border-emerald-900 bg-emerald-950/50 text-emerald-300",
    warn: "border-amber-900/60 bg-amber-950/30 text-amber-200",
    danger: "border-red-900 bg-red-950/50 text-red-300",
    info: "border-sky-900 bg-sky-950/40 text-sky-200",
    accent: "border-fuchsia-900/60 bg-fuchsia-950/30 text-fuchsia-200",
  };
  return (
    <p className={cx("rounded-lg border px-3 py-2 text-sm", map[tone])}>
      {children}
    </p>
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
    <div className="rounded-xl border border-dashed border-neutral-800 px-6 py-10 text-center">
      <p className="text-sm font-medium text-neutral-300">{title}</p>
      {children ? (
        <p className="mx-auto mt-1.5 max-w-md text-sm text-neutral-500">
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
    <div>
      <dt className="text-xs text-neutral-500" title={note}>
        {label}
      </dt>
      <dd className="mt-0.5 text-lg font-semibold text-neutral-100">{value}</dd>
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
        <Pill tone="ok" title="Multiple of this channel's own median">
          ↗ {score}
        </Pill>
      ) : null}
      <Pill tone="info" title={viewsLabel}>
        ◎ {formatCount(views)}
      </Pill>
      {engagement !== null ? (
        <Pill
          tone="warn"
          title="Likes plus comments, over views"
        >
          ✦ {Math.round(engagement * 100)}%
        </Pill>
      ) : null}
    </div>
  );
}

// ── keyboard affordances ───────────────────────────────────────────────────

/** A key cap, e.g. the "S" beside "Shortlist". */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 font-sans text-[10px] text-neutral-400">
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
    <div className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-6">
      <p className="text-sm font-medium text-amber-200">💎 {title}</p>
      <div className="mt-2 text-sm leading-relaxed text-neutral-300">
        {children}
      </div>
      {reason ? <p className="mt-3 text-xs text-neutral-500">{reason}</p> : null}
      <ButtonLink href="/pricing" tone="primary" className="mt-5">
        {cta}
      </ButtonLink>
    </div>
  );
}
