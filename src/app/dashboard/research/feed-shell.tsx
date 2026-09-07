"use client";

import { useState, type ReactNode } from "react";

import { Icon } from "@/components/icons";
import { TwoPane, buttonClass } from "@/components/ui";

// The feed's toolbar and the two-pane beside it.
//
// The filter panel is always on screen above the `wide` breakpoint. It was
// behind a toggle, on the reasoning that it cost 248px of the widest screen in
// the app to controls people set once — but the controls turned out not to be
// set-once, and a filter you cannot see is a filter you forget the feed is
// applying. Hidden filters also make the feed look broken from the other
// direction: rows are missing and nothing on screen says why.
//
// Below `wide` the two panes stack, and there the panel IS collapsible — a
// phone cannot afford a screenful of controls above the results, and on a
// phone the controls are genuinely set-once.
//
// A client component only for that one piece of state: the panel and the grid
// are passed through as children and stay server-rendered.

export type ExportRow = {
  title: string;
  url: string;
  handle: string | null;
  score: number | null;
  views: number | null;
};

export function FeedShell({
  active,
  left,
  sort,
  rows,
  panel,
  children,
}: {
  /** A filter is applied, so the panel opens with the page. */
  active: boolean;
  left: ReactNode;
  sort: ReactNode;
  rows: ExportRow[];
  panel: ReactNode;
  children: ReactNode;
}) {
  // Only ever consulted below `wide`, where the panel stacks above the grid.
  // Open when a filter is already applied, so a shared link does not look
  // unfiltered.
  const [openOnPhone, setOpenOnPhone] = useState(active);
  const [copied, setCopied] = useState(false);

  // Exports what is on screen, filters and all — the list somebody just built
  // is the list they want to paste somewhere. Markdown because every
  // destination that matters reads it.
  const copy = async () => {
    const text = rows
      .map(
        (row) =>
          `- [${row.title}](${row.url})${row.handle ? ` — @${row.handle}` : ""}` +
          `${row.score === null ? "" : ` · ${row.score.toFixed(1)}x`}` +
          `${row.views === null ? "" : ` · ${row.views.toLocaleString()} views`}`,
      )
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2400);
    } catch {
      // Clipboard access is refused on an insecure origin and in some
      // embedded browsers. Saying so beats a button that appears to do
      // nothing.
      setCopied(false);
      window.prompt("Copy these videos:", text);
    }
  };

  return (
    <>
      {/* A bare row, not a panel. Every control in it already carries its own
          border and its own panel fill, so drawing one more around the group
          put a bordered white box inside a bordered white box for no gain. */}
      <div className="flex flex-wrap items-center gap-2.5">
        {left}
        <div className="ml-auto flex flex-wrap items-center gap-2.5">
          {/* Hidden where the panel is permanent. A control that toggles
              something already on screen is a control that does nothing. */}
          <button
            type="button"
            onClick={() => setOpenOnPhone((v) => !v)}
            aria-expanded={openOnPhone}
            // Not `buttonClass(...) + overrides`: two border-colour utilities
            // in one class string are resolved by CSS source order, not by the
            // order they were written, so the override silently lost.
            className={`wide:hidden ${
              openOnPhone
                ? "inline-flex items-center justify-center gap-2 rounded-md border border-accent bg-accent-soft px-2.5 py-1.5 text-[12.5px] font-semibold text-accent transition-[background-color,color,border-color] duration-110"
                : buttonClass("secondary", "xs")
            }`}
          >
            <Icon name="filter" className="h-3.5 w-3.5" />
            Filters
          </button>
          {sort}
          <button
            type="button"
            onClick={copy}
            disabled={rows.length === 0}
            className={buttonClass("secondary", "xs")}
          >
            <Icon name="export" className="h-3.5 w-3.5" />
            {copied ? "Copied" : "Export"}
          </button>
        </div>
      </div>

      <TwoPane>
        <div
          className={`min-w-[248px] flex-[0_1_248px] ${
            openOnPhone ? "" : "hidden wide:block"
          }`}
        >
          {panel}
        </div>
        <div className="min-w-[min(100%,320px)] flex-[1_1_560px]">{children}</div>
      </TwoPane>
    </>
  );
}
