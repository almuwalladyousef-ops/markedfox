import type { ReactNode } from "react";

import { cx } from "@/components/ui";

// One shell for every settings pane, so thirteen screens written over several
// sittings cannot each invent their own heading size.
export function Pane({
  title,
  blurb,
  actions,
  children,
  /** Forms read badly at full width; `narrow` is the 26rem measure the
   *  handoff specifies for them. */
  width = "full",
}: {
  title: string;
  blurb?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  width?: "full" | "narrow";
}) {
  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-[26px]/[32px] font-bold tracking-[-0.02em] text-ink">
            {title}
          </h2>
          {blurb ? (
            <p className="mt-2 max-w-xl text-[15px]/[24px] text-pretty text-muted">
              {blurb}
            </p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </header>
      <div className={cx("flex flex-col gap-5", width === "narrow" && "max-w-[26rem]")}>
        {children}
      </div>
    </section>
  );
}

/** A row of links or actions that are each one sentence and a button — Help,
 *  Feedback, the subscription's own list. */
export function PaneRow({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: ReactNode;
  action: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-panel px-5 py-4">
      <div className="min-w-0">
        <p className="text-[14.5px] font-semibold text-ink">{title}</p>
        {detail ? (
          <p className="mt-1 text-[13.5px]/[20px] text-pretty text-muted">
            {detail}
          </p>
        ) : null}
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}
