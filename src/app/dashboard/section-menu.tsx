"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useState, type ReactNode } from "react";

import { Icon, PlanDiamond } from "@/components/icons";
import { useEscape, overlayProps } from "@/components/overlay";
import { cx } from "@/components/ui";
import { activeMobileTab, MOBILE_TABS, type MobileTabId } from "@/lib/mobile-nav";
import { activeRowHref } from "@/lib/shell";

import { isDecoratedItem, type DecoratedSpace } from "./shell-types";

// The pages behind the phone's current tab, opened by pressing that tab again.
//
// This lived as a hamburger next to the section name in the top bar. Owner
// decision, 2026-09-06: move it to the bottom, where the thumb already is.
// Pressing the tab you are already on is the phone convention for "show me
// more of this", and it adds no control to a row that has five.
//
// The cost of that convention is that it is invisible, so the tab that has a
// menu wears a chevron above its icon — the same hint a bottom sheet uses to
// say it can be pulled up.
//
// The provider owns the sheet because the two halves of this live in different
// components: MobileTabs is the bottom bar and knows what was pressed, while
// the row data comes from the layout. A context is the join.

/** Which desktop space each phone tab borrows its menu from, and which of that
 *  space's rows belong in it. Null means the tab has no menu — Account is
 *  already a menu of thirteen rows and does not need a menu of a menu. */
const MENU: Record<MobileTabId, { space: string; only?: string[] } | null> = {
  home: { space: "home", only: ["/dashboard/calendar", "/dashboard/drafts"] },
  automate: { space: "automate" },
  feed: { space: "studio" },
  account: null,
};

type SectionMenu = {
  /** True when the current tab has pages behind it, which is what decides
   *  whether the bottom bar draws its chevron and intercepts the press. */
  readonly hasMenu: boolean;
  readonly open: () => void;
};

const Context = createContext<SectionMenu>({ hasMenu: false, open: () => {} });

export function useSectionMenu(): SectionMenu {
  return useContext(Context);
}

export function SectionMenuProvider({
  spaces,
  children,
}: {
  spaces: DecoratedSpace[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const rowHref = activeRowHref(pathname);
  const tabId = activeMobileTab(pathname);
  const tab = MOBILE_TABS.find((item) => item.id === tabId);

  // Stores WHERE it was opened, not whether it is open, and is open only while
  // that still matches. Next keeps this mounted across a route change, so a
  // boolean would leave the sheet over the page it just sent you to — and
  // closing it in an effect means setting state during a pass that has already
  // run. Deriving it needs neither.
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt === pathname;
  useEscape(() => setOpenedAt(null));

  const spec = tabId ? MENU[tabId] : null;
  const space = spec ? spaces.find((s) => s.id === spec.space) : undefined;
  const rows = (space?.rows ?? [])
    .filter(isDecoratedItem)
    .filter((row) => (spec?.only ? spec.only.includes(row.href) : true));

  return (
    <Context.Provider
      value={{ hasMenu: rows.length > 0, open: () => setOpenedAt(pathname) }}
    >
      {children}

      {open && rows.length > 0 ? (
        // Above the bottom bar's z-45. A modal the navigation paints over is
        // not modal, and this one opens FROM that navigation.
        <div {...overlayProps(() => setOpenedAt(null), "sheet", "z-50")}>
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
                onClick={() => setOpenedAt(null)}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-[background-color,color] duration-110 hover:bg-chip hover:text-ink"
              >
                <Icon name="close" className="h-[17px] w-[17px]" />
              </button>
            </div>

            {/* Eight rows plus a header is taller than a short phone, so the
                list scrolls inside the sheet rather than the sheet growing past
                the screen and hiding its own last row. */}
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
    </Context.Provider>
  );
}
