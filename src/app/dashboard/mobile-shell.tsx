"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Icon, PlanDiamond } from "@/components/icons";
import { useEscape, overlayProps } from "@/components/overlay";
import { FoxMark, cx } from "@/components/ui";
import { MOBILE_TABS, activeMobileTab, type MobileTabId } from "@/lib/mobile-nav";
import { activeRowHref } from "@/lib/shell";
import type { Workspace } from "@/lib/workspaces/store";

import { isDecoratedItem, type DecoratedSpace } from "./shell-types";
import { WorkspaceSwitcher } from "./workspace-switcher";

// Below 880px the two desktop rails are gone. What replaces them: a top bar
// carrying the mark, where you are, a three-line menu, and the workspace tile.
//
// The section's own pages used to sit under that bar as a horizontally
// scrolling chip row. Two problems with a chip strip, and both are why it is
// now a menu (owner decision, 2026-09-06). It spent permanent vertical space
// on every screen for links most visits never use, and it is horizontal
// scrolling — anything past the third chip was invisible unless you thought to
// swipe a row that gives no sign it can be swiped. Research alone has seven
// rows. A menu shows all of them, on demand, and costs one 34px button.
//
// The settings gear and the theme toggle are gone from this bar too. The
// Account tab already opens settings, and the theme lives in
// Settings → Appearance, so both were a second door to a room with a door.

/** Which desktop space each phone tab borrows its menu from, and which of that
 *  space's rows belong in it. Empty means the tab has no menu button at all —
 *  Account is already a menu of thirteen rows and does not need a menu of a
 *  menu. */
const MENU: Record<MobileTabId, { space: string; only?: string[] } | null> = {
  home: { space: "home", only: ["/dashboard/calendar", "/dashboard/drafts"] },
  drafts: {
    space: "home",
    only: ["/dashboard/calendar", "/dashboard/drafts"],
  },
  feed: { space: "studio" },
  account: null,
};

export function MobileShell({
  spaces,
  workspaces,
  activeId,
  canCreate,
  createBlockedReason,
  remaining,
}: {
  spaces: DecoratedSpace[];
  workspaces: Workspace[];
  activeId: string;
  canCreate: boolean;
  createBlockedReason?: string;
  remaining?: number | null;
}) {
  const pathname = usePathname();
  const rowHref = activeRowHref(pathname);
  const tabId = activeMobileTab(pathname);
  const tab = MOBILE_TABS.find((item) => item.id === tabId);
  // The menu stores WHERE it was opened, not whether it is open, and is open
  // only while that still matches. Next keeps this component mounted across a
  // route change, so a boolean would leave the menu sitting over the page it
  // just sent you to — and closing it in an effect means setting state during
  // a render pass that has already happened. Deriving it needs neither.
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt === pathname;
  const setOpen = (next: boolean) => setOpenedAt(next ? pathname : null);

  useEscape(() => setOpen(false));

  const spec = tabId ? MENU[tabId] : null;
  const space = spec ? spaces.find((s) => s.id === spec.space) : undefined;
  const rows = (space?.rows ?? [])
    .filter(isDecoratedItem)
    .filter((row) => (spec?.only ? spec.only.includes(row.href) : true));

  return (
    <div className="shell:hidden">
      <div className="sticky top-0 z-30 flex items-center gap-2.5 border-b border-line bg-panel/95 px-4 py-3 backdrop-blur-md">
        <Link
          href="/dashboard"
          title="MarkedFox — home"
          aria-label="MarkedFox home"
          className="shrink-0"
        >
          <FoxMark className="h-6" />
        </Link>
        <span className="font-display truncate text-[17px] font-extrabold tracking-[-0.02em] text-ink">
          {tab?.label ?? "MarkedFox"}
        </span>
        <span className="flex-1" />

        {rows.length > 0 ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label={`More in ${tab?.label ?? "this section"}`}
            title={`More in ${tab?.label ?? "this section"}`}
            className="flex h-[34px] w-[34px] items-center justify-center rounded-md text-muted transition-[background-color,color,scale] duration-110 hover:bg-chip hover:text-ink active:scale-[0.94]"
          >
            <Icon name="panel" className="h-[19px] w-[19px]" />
          </button>
        ) : null}

        <WorkspaceSwitcher
          workspaces={workspaces}
          activeId={activeId}
          canCreate={canCreate}
          createBlockedReason={createBlockedReason}
          remaining={remaining}
          variant="compact"
        />
      </div>

      {open ? (
        // Above the bottom tab bar's z-45, not below it. A modal that the
        // navigation paints over is not modal, and at z-40 the bar was sitting
        // on the last two rows of a Research menu that has eight.
        <div {...overlayProps(() => setOpen(false), "sheet", "z-50")}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${tab?.label ?? "Section"} pages`}
            className="mf-sheet flex max-h-[82vh] w-full flex-col rounded-t-2xl border-t border-line bg-panel pb-[calc(18px+env(safe-area-inset-bottom))] shell:max-w-sm shell:rounded-2xl shell:border"
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <span className="font-display text-[15px] font-bold text-ink">
                {tab?.label}
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-[background-color,color] duration-110 hover:bg-chip hover:text-ink"
              >
                <Icon name="close" className="h-[17px] w-[17px]" />
              </button>
            </div>

            {/* Eight rows plus a header is taller than a short phone, so the
                list scrolls inside the sheet rather than the sheet growing
                past the screen and hiding its own last row. */}
            <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-1">
              {rows.map((row) => {
                const on = row.href === rowHref;
                return (
                  <Link
                    key={row.href}
                    href={row.href}
                    title={row.tip}
                    aria-current={on ? "page" : undefined}
                    className={cx(
                      "flex min-h-[46px] items-center gap-3 rounded-lg px-3 text-[15px] font-semibold transition-[background-color,color] duration-110 active:scale-[0.99]",
                      on ? "bg-chip text-ink" : "text-muted",
                    )}
                  >
                    <Icon
                      name={row.icon}
                      className={cx("h-[19px] w-[19px]", on ? "" : "opacity-70")}
                    />
                    <span className="flex-1 truncate">{row.label}</span>
                    {row.locked ? <PlanDiamond className="h-3 w-3" /> : null}
                    {!row.locked && row.badge ? (
                      <span className="rounded-full bg-chip px-1.5 text-[11px] font-bold">
                        {row.badge > 99 ? "99+" : row.badge}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      ) : null}
    </div>
  );
}
