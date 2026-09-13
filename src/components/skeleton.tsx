import type { CSSProperties } from "react";

import { cx } from "@/components/ui";

// Skeletons: the shape of a page drawn before its data arrives.
//
// Every dashboard page does its reads on the server, so between a press and
// the new page there is a real wait — and before these existed that wait
// showed either nothing at all or one small spinner in a large empty space.
// A skeleton answers the press at once and tells the person what is coming,
// so the page they land on is the one they were already looking at.
//
// Each route's `loading.tsx` composes these into its own page's outline. They
// are deliberately plain blocks — a skeleton that tries to look like the real
// thing reads as a broken page instead of a loading one.

export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div aria-hidden className={cx("mf-skeleton rounded-md", className)} style={style} />
  );
}

/** The live region every loading screen carries, so a screen reader hears
 *  that something is happening while sighted users see the shapes. */
export function SkeletonPage({
  label = "Loading",
  width = "max-w-[1080px]",
  children,
}: {
  label?: string;
  width?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className={cx("mx-auto flex w-full flex-col gap-6", width)}
    >
      {children}
    </div>
  );
}

/** A page title and, on desktop, its subtitle — the same measure PageHeader
 *  renders, so nothing jumps when the real header replaces it. */
export function SkeletonHeader({
  actions = 0,
  subtitle = true,
}: {
  actions?: number;
  subtitle?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-48 rounded-lg" />
        {subtitle ? <Skeleton className="hidden h-4 w-80 shell:block" /> : null}
      </div>
      {actions > 0 ? (
        <div className="flex gap-2">
          {Array.from({ length: actions }, (_, i) => (
            <Skeleton key={i} className="h-10 w-28 rounded-lg" />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** A row of pill-shaped filters or tabs. */
export function SkeletonPills({ count = 4, centered = false }: { count?: number; centered?: boolean }) {
  return (
    <div className={cx("flex flex-wrap gap-2", centered && "justify-center")}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-9 rounded-full" style={{ width: 72 + ((i * 29) % 48) }} />
      ))}
    </div>
  );
}

/** Tiles: the home grid, the research feed, channel cards, templates. */
export function SkeletonGrid({
  count = 8,
  aspect = "aspect-[9/16]",
  columns = "grid-cols-2 sm:grid-cols-3 wide:grid-cols-4",
  caption = false,
}: {
  count?: number;
  aspect?: string;
  columns?: string;
  caption?: boolean;
}) {
  return (
    <div className={cx("grid gap-3", columns)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-2.5">
          <Skeleton className={cx("w-full rounded-lg", aspect)} />
          {caption ? (
            <>
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-3.5 w-1/2" />
            </>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** A bordered list of rows: automations, drafts, scripts, projects, rules. */
export function SkeletonList({ rows = 5, avatar = true }: { rows?: number; avatar?: boolean }) {
  return (
    <div className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-panel">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4">
          {avatar ? <Skeleton className="h-10 w-10 shrink-0 rounded-lg" /> : null}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4" style={{ width: `${56 - ((i * 13) % 24)}%` }} />
            <Skeleton className="h-3.5" style={{ width: `${34 - ((i * 7) % 12)}%` }} />
          </div>
          <Skeleton className="hidden h-8 w-20 rounded-lg sm:block" />
        </div>
      ))}
    </div>
  );
}

/** A bordered card holding a few labelled fields — forms and settings panes. */
export function SkeletonForm({ fields = 3 }: { fields?: number }) {
  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-line bg-panel p-6">
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
      ))}
      <Skeleton className="h-10 w-32 self-end rounded-lg" />
    </div>
  );
}

/** A row of stat figures under a profile — Home's header. */
export function SkeletonProfile() {
  return (
    <div className="flex items-center gap-5">
      <Skeleton className="h-20 w-20 shrink-0 rounded-full" />
      <div className="flex flex-1 flex-col gap-3">
        <Skeleton className="h-6 w-44 rounded-lg" />
        <div className="flex gap-8">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Skeleton className="h-5 w-12" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
