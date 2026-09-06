"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { FoxMark } from "@/components/ui";
import { MOBILE_TABS, activeMobileTab } from "@/lib/mobile-nav";
import type { Workspace } from "@/lib/workspaces/store";

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
