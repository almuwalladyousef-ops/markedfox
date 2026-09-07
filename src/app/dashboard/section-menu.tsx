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

// The pages behind the phone's current tab: Calendar and Drafts on Home, all
// eight research pages on Research.
//
// This control has now been in three places, and the third one is the lesson.
// It started as a hamburger in the top-right corner — the furthest point from
// a thumb. It moved to "press the tab you are already on", which is the phone
// convention and is completely invisible; the owner went looking for these
// pages and could not find them, which is the only usability test that
// matters. It is now a named bar sitting directly on top of the tab bar:
// "Home ▾", "Research ▾".
//
// The gesture still works as a shortcut for anybody who knows it. It is no
// longer the way in, because a convention nobody can see is a feature nobody
// uses.
//
// The provider owns both halves because they live in different components:
// MobileTabs is the bottom bar and knows what was pressed, the row data comes
// from the layout, and the sheet has to sit above both. A context is the join.

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

      {/* The visible half of this, and the reason it exists. Pressing the tab
          you are already on is the phone convention, but a convention nobody
          can see is a feature nobody uses — the owner went looking for these
          pages and could not find them. So the section names itself just above
          the bar, at thumb height, with a caret saying it opens.

          Sits at the tab bar's own z-45 and directly on top of it, so the two
          read as one piece of furniture rather than a strip floating over the
          page. Left-aligned rather than centred because the centre of that bar
          is where the compose button rises out of it — centred, this pill
          landed on top of the orange +. The wrapper is pointer-events-none so
          the strip either side of the pill does not swallow taps meant for the
          page behind it. `shell:hidden` because above the breakpoint the rail already
          lists every one of these rows. */}
      {rows.length > 0 ? (
        <div className="pointer-events-none fixed right-0 bottom-[calc(66px+env(safe-area-inset-bottom))] left-0 z-[45] flex justify-start px-4 shell:hidden">
          <button
            type="button"
            onClick={() => setOpenedAt(pathname)}
            aria-haspopup="dialog"
            aria-expanded={open}
            className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-line bg-panel/95 px-3.5 py-1.5 text-[12.5px] font-bold text-ink shadow-e1 backdrop-blur-md transition-[background-color,scale] duration-110 active:scale-[0.96]"
          >
            {tab?.label}
            <Icon
              name="chevronUp"
              className="h-3.5 w-3.5 shrink-0 text-muted"
              strokeWidth={2.4}
            />
          </button>
        </div>
      ) : null}

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
