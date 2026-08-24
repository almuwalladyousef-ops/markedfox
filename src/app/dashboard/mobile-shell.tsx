"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon, PlanDiamond } from "@/components/icons";
import { ThemeToggle } from "@/components/theme-toggle";
import { FoxMark, cx } from "@/components/ui";
import { activeRowHref, activeSpace } from "@/lib/shell";
import type { Theme } from "@/lib/theme";
import type { Workspace } from "@/lib/workspaces/store";

import { isDecoratedItem, type DecoratedSpace } from "./shell-types";
import { WorkspaceSwitcher } from "./workspace-switcher";

// Below 880px the two rails are gone. What replaces them, per the handoff: a
// top bar with the mark, the current space's title and the workspace tile,
// then a horizontally scrolling chip row of the current space's rows. The
// three spaces themselves live in the bottom tab bar (mobile-tabs.tsx).

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
  const spaceId = activeSpace(pathname).id;
  const space = spaces.find((s) => s.id === spaceId) ?? spaces[0];

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
          {space.title}
        </span>
        <span className="flex-1" />
        <Link
          href="/dashboard/settings"
          title="Settings — account, billing and connected accounts"
          aria-label="Settings"
          className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] text-muted"
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

      <div className="flex gap-1.5 overflow-x-auto px-4 pt-2.5 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {space.rows.filter(isDecoratedItem).map((row) => {
          const on = row.href === rowHref;
          return (
            <Link
              key={row.href}
              href={row.href}
              title={row.tip}
              aria-current={on ? "page" : undefined}
              className={cx(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-[13px] py-[7px] text-[12.5px] font-semibold transition-[background,color] duration-150",
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
    </div>
  );
}
