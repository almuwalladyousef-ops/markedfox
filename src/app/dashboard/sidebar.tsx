"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "@/components/icons";
import { Tooltip } from "@/components/tooltip";
import { FoxMark, cx } from "@/components/ui";
import { activeRowHref, activeSpace, type ShellSpaceId } from "@/lib/shell";
import type { Workspace } from "@/lib/workspaces/store";

import { NavRow } from "./sidebar-nav";
import { isDecoratedItem, type DecoratedSpace } from "./shell-types";
import { WorkspaceSwitcher } from "./workspace-switcher";

// The shell's two rails, per the redesign handoff: a 68px ink dock holding the
// three spaces, New post and Settings, and a 236px contextual rail holding
// only the current space's own rows. The old single 262px sidebar — six
// titled groups, thirteen rows, a collapse toggle — is gone; the dock is
// already the collapsed state, so there is nothing left to collapse.
//
// The user row and plan label left the rail too: they live in Settings, which
// the dock's own button reaches.

export function Sidebar({
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
  const onSettings = pathname.startsWith("/dashboard/settings");
  const rowHref = activeRowHref(pathname);
  const spaceId: ShellSpaceId = activeSpace(pathname).id;
  const space = spaces.find((s) => s.id === spaceId) ?? spaces[0];

  return (
    <>
      {/* ── the dock ─────────────────────────────────────────────────── */}
      <aside className="sticky top-0 hidden h-screen shrink-0 py-3.5 pl-3.5 shell:flex">
        <div className="flex w-[68px] flex-col items-center gap-2 rounded-[22px] border border-dock-line bg-dock pt-4 pb-3.5">
          {/* The dock is icon-only, so every one of these carries its name in
              a tooltip rather than in the browser's `title` bubble: that one
              waits a second, ignores the theme, and never appears for a
              keyboard. On primary navigation it is not good enough. */}
          <Tooltip label="Home" className="mb-1.5 w-11 justify-center">
            <Link
              href="/dashboard"
              aria-label="MarkedFox home"
              className="flex w-11 justify-center"
            >
              <FoxMark className="w-11" />
            </Link>
          </Tooltip>

          {/* The app's one accent button. */}
          <Tooltip label="New post" className="mb-1.5">
            <Link
              href="/dashboard/new-post"
              aria-label="New post"
              className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-accent text-accent-ink shadow-[0_8px_20px_var(--accent-glow)] transition-transform duration-150 hover:scale-[1.06] active:scale-[0.94]"
            >
              <Icon name="plus" className="h-5 w-5" strokeWidth={2.2} />
            </Link>
          </Tooltip>

          <div className="flex flex-1 flex-col gap-1.5">
            {spaces.map((s) => {
              const on = !onSettings && s.id === spaceId;
              return (
                <Tooltip key={s.id} label={s.tip ?? s.label}>
                  <Link
                    href={s.firstHref}
                    aria-label={s.label}
                    aria-current={on ? "page" : undefined}
                    className={cx(
                      "flex h-11 w-11 items-center justify-center rounded-[15px] transition-[background,color,scale] duration-150 active:scale-[0.92]",
                      on
                        ? "bg-accent text-accent-ink"
                        : "text-dock-idle hover:text-dock-hover",
                    )}
                  >
                    <Icon name={s.icon} className="h-[21px] w-[21px]" />
                  </Link>
                </Tooltip>
              );
            })}
          </div>

          <Tooltip label="Settings — account, billing and connected accounts">
            <Link
              href="/dashboard/settings"
              aria-label="Settings"
              aria-current={onSettings ? "page" : undefined}
              className={cx(
                "flex h-11 w-11 items-center justify-center rounded-[15px] transition-[background,color,scale] duration-150 active:scale-[0.92]",
                onSettings
                  ? "bg-accent text-accent-ink"
                  : "text-dock-idle hover:text-dock-hover",
              )}
            >
              <Icon name="settings" className="h-[21px] w-[21px]" />
            </Link>
          </Tooltip>
        </div>
      </aside>

      {/* ── the contextual rail ──────────────────────────────────────── */}
      <aside className="sticky top-0 hidden h-screen w-[236px] shrink-0 py-3.5 pl-3 shell:flex">
        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto rounded-[22px] border border-line bg-panel/75 px-3 pt-[18px] pb-3.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="mb-2.5">
            <WorkspaceSwitcher
              workspaces={workspaces}
              activeId={activeId}
              canCreate={canCreate}
              createBlockedReason={createBlockedReason}
              remaining={remaining}
            />
          </div>

          <p className="font-display mx-0.5 text-[19px] font-extrabold tracking-[-0.02em] text-ink">
            {space.title}
          </p>
          <p className="mx-0.5 mb-3 text-[12.5px] text-faint">{space.sub}</p>

          {space.rows.map((row, i) =>
            isDecoratedItem(row) ? (
              <NavRow
                key={row.href}
                href={row.href}
                label={row.label}
                icon={row.icon}
                tip={row.tip}
                active={row.href === rowHref}
                badge={row.badge}
                locked={row.locked}
              />
            ) : (
              <p
                key={`h-${i}`}
                className="mx-1 mt-3.5 mb-1 text-[10.5px] font-bold tracking-[0.1em] text-faint uppercase"
              >
                {row.heading}
              </p>
            ),
          )}

          <div className="flex-1" />

          {/* The space's usage meter, real numbers from the entitlement
              snapshot. No bar on an unlimited figure — a full bar and a bar
              with no ceiling look identical and mean opposite things. */}
          <div className="mt-3 rounded-[15px] border border-line bg-panel px-3.5 py-[13px]">
            <p className="text-[12px] font-bold text-ink">{space.meter.title}</p>
            <p className="mt-1 mb-2 text-[11.5px]/[16px] text-faint">
              {space.meter.note}
            </p>
            {space.meter.pct === null ? null : (
              <div className="h-[5px] overflow-hidden rounded-full bg-chip">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${space.meter.pct}%` }}
                />
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
