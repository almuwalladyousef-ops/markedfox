"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon, PlanDiamond } from "@/components/icons";
import { ThemeToggle } from "@/components/theme-toggle";
import { FoxMark, cx } from "@/components/ui";
import { MOBILE_TABS, activeMobileTab, type MobileTabId } from "@/lib/mobile-nav";
import { activeRowHref } from "@/lib/shell";
import type { Theme } from "@/lib/theme";
import type { Workspace } from "@/lib/workspaces/store";

import { isDecoratedItem, type DecoratedSpace } from "./shell-types";
import { WorkspaceSwitcher } from "./workspace-switcher";

// Below 880px the two rails are gone. What replaces them: a top bar with the
// mark, the workspace tile, and — only where it earns its height — a
// horizontally scrolling chip row of the current tab's sibling routes.
//
// The chip row used to render on every screen because it was keyed to the
// desktop *space*. Two tabs do not want one. Home is the profile surface from
// the reference and carries its own segmented filter directly under the
// avatars, so a second strip of chips above it competed with the real one.
// Account is a menu of thirteen rows; chips duplicating three of them are
// noise. So chips appear on Drafts (where Calendar is the sibling worth one
// tap) and on Feed (where the whole Studio lives behind the feed).

/** Which desktop space each phone tab borrows its chip row from, and which of
 *  that space's rows are worth a chip. Empty means the tab renders no chips. */
const CHIPS: Record<MobileTabId, { space: string; only?: string[] }| null> = {
  home: null,
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
  theme,
}: {
  spaces: DecoratedSpace[];
  workspaces: Workspace[];
  activeId: string;
  canCreate: boolean;
  createBlockedReason?: string;
  remaining?: number | null;
  theme: Theme;
}) {
  const pathname = usePathname();
  const rowHref = activeRowHref(pathname);
  const tabId = activeMobileTab(pathname);
  const tab = MOBILE_TABS.find((item) => item.id === tabId);

  const chipSpec = tabId ? CHIPS[tabId] : null;
  const space = chipSpec ? spaces.find((s) => s.id === chipSpec.space) : undefined;
  const chips = (space?.rows ?? []).filter(isDecoratedItem).filter((row) =>
    chipSpec?.only ? chipSpec.only.includes(row.href) : true,
  );

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
        <Link
          href="/dashboard/settings"
          title="Settings — account, billing and connected accounts"
          aria-label="Settings"
          className="flex h-[34px] w-[34px] items-center justify-center rounded-md text-muted"
        >
          <Icon name="settings" className="h-[19px] w-[19px]" />
        </Link>
        <ThemeToggle initial={theme} />
        <WorkspaceSwitcher
          workspaces={workspaces}
          activeId={activeId}
          canCreate={canCreate}
          createBlockedReason={createBlockedReason}
          remaining={remaining}
          variant="compact"
        />
      </div>

      {chips.length > 0 ? (
        <div className="flex gap-1.5 overflow-x-auto px-4 pt-2.5 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {chips.map((row) => {
            const on = row.href === rowHref;
            return (
              <Link
                key={row.href}
                href={row.href}
                title={row.tip}
                aria-current={on ? "page" : undefined}
                className={cx(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-[background-color,color] duration-110",
                  on
                    ? "border-ink bg-ink text-panel"
                    : "border-line bg-panel text-muted",
                )}
              >
                {row.label}
                {row.locked ? <PlanDiamond className="h-2.5 w-2.5" /> : null}
                {!row.locked && row.badge ? (
                  <span className="rounded-full bg-chip px-1.5 text-[10.5px] font-bold">
                    {row.badge > 99 ? "99+" : row.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
