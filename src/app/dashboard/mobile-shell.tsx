"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "@/components/icons";
import { FoxMark } from "@/components/ui";
import { MOBILE_TABS, activeMobileTab } from "@/lib/mobile-nav";
import type { Workspace } from "@/lib/workspaces/store";

import { useSectionMenu } from "./section-menu";
import { WorkspaceSwitcher } from "./workspace-switcher";

// Below 880px the two desktop rails are gone. What replaces them is this: the
// mark, where you are, and the workspace tile. That is the whole bar.
//
// It has lost three things, each for the same reason — a second door to a room
// that already has one. The settings gear went because the Account tab opens
// settings. The theme toggle went because the theme lives in Settings →
// Appearance. And the section menu went to the bottom bar (owner decision,
// 2026-09-06): pressing the tab you are already on is the phone convention for
// "show me more of this", and it puts the control where the thumb is instead
// of at the top corner of a 390px screen. See `section-menu.tsx`.
//
// Before the menu, those pages were a horizontally scrolling chip row under
// this bar. It spent permanent vertical space on every screen for links most
// visits never use, and anything past the third chip was invisible unless you
// thought to swipe a row that gives no sign it can be swiped.

export function MobileShell({
  workspaces,
  activeId,
  canCreate,
  createBlockedReason,
  remaining,
}: {
  workspaces: Workspace[];
  activeId: string;
  canCreate: boolean;
  createBlockedReason?: string;
  remaining?: number | null;
}) {
  const pathname = usePathname();
  const tabId = activeMobileTab(pathname);
  const tab = MOBILE_TABS.find((item) => item.id === tabId);
  const menu = useSectionMenu();

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

        {/* The section name IS the control when there are pages behind it:
            a word you are already reading, wearing a caret. That is what makes
            it findable — a lone icon in the corner was ignored, and a floating
            pill above the tab bar belonged to nothing. */}
        {menu.hasMenu ? (
          <button
            type="button"
            onClick={menu.open}
            aria-haspopup="dialog"
            aria-label={`${tab?.label ?? "Section"} — show its pages`}
            title={`${tab?.label ?? "Section"} — show its pages`}
            className="-my-1 -ml-1 flex min-w-0 items-center gap-1 rounded-md py-1 pr-1.5 pl-1 text-ink transition-[background-color,scale] duration-110 hover:bg-chip active:scale-[0.97]"
          >
            <span className="font-display truncate text-[17px] font-extrabold tracking-[-0.02em]">
              {tab?.label ?? "MarkedFox"}
            </span>
            <Icon
              name="chevronDown"
              className="h-4 w-4 shrink-0 text-muted"
              strokeWidth={2.4}
            />
          </button>
        ) : (
          <span className="font-display truncate text-[17px] font-extrabold tracking-[-0.02em] text-ink">
            {tab?.label ?? "MarkedFox"}
          </span>
        )}

        <span className="flex-1" />

        <WorkspaceSwitcher
          workspaces={workspaces}
          activeId={activeId}
          canCreate={canCreate}
          createBlockedReason={createBlockedReason}
          remaining={remaining}
          variant="compact"
        />
      </div>
    </div>
  );
}
