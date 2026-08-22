"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Icon } from "@/components/icons";
import { FoxMark, cx } from "@/components/ui";
import { SIDEBAR_COOKIE, type SidebarState } from "@/lib/sidebar";
import type { Workspace } from "@/lib/workspaces/store";

import { NavRow, SidebarNav, type NavSection } from "./sidebar-nav";
import { WorkspaceSwitcher } from "./workspace-switcher";

// The sidebar as a floating panel rather than a wall: its own rounded card
// with the page scrolling beside it.
//
// It is a client component so collapsing is instant — the width is state here
// and a cookie for the next request, which is what keeps the server's first
// paint the same width the person left it at.
//
// One thing that was got wrong once and is worth keeping right: the collapse
// toggle stays visible when collapsed. An earlier version hid it at 92px, on
// the theory that the rail was already minimal, which left no way back out.

export function Sidebar({
  sections,
  workspaces,
  activeId,
  canCreate,
  createBlockedReason,
  remaining,
  email,
  planId,
  initial,
}: {
  sections: NavSection[];
  workspaces: Workspace[];
  activeId: string;
  canCreate: boolean;
  createBlockedReason?: string;
  remaining?: number | null;
  email: string | null;
  planId: string;
  initial: SidebarState;
}) {
  const [state, setState] = useState<SidebarState>(initial);
  const collapsed = state === "collapsed";
  const pathname = usePathname();
  const onSettings = pathname.startsWith("/dashboard/settings");

  const toggle = () => {
    const next: SidebarState = collapsed ? "open" : "collapsed";
    setState(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next};path=/;max-age=31536000;samesite=lax`;
  };

  const collapseButton = (
    <button
      type="button"
      onClick={toggle}
      aria-expanded={!collapsed}
      title={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
      aria-label={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
      className={cx(
        "flex shrink-0 items-center justify-center text-muted transition-[background,color] duration-150 hover:text-ink",
        collapsed
          ? "h-[34px] w-[34px] rounded-[10px] bg-chip"
          : "h-7 w-7 rounded-lg hover:bg-chip",
      )}
    >
      <Icon name="panel" className="h-[17px] w-[17px]" />
    </button>
  );

  return (
    <aside
      className={cx(
        "sticky top-0 hidden h-screen shrink-0 flex-col py-3.5 pl-3.5 shell:flex",
        // A width transition rather than a jump: the page beside it reflows
        // either way, and a jump reads as a reload.
        "transition-[width] duration-[180ms] ease-out",
        collapsed ? "w-[92px]" : "w-[262px]",
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 rounded-3xl border border-line bg-panel px-3 pt-5 pb-3">
        {collapsed ? (
          <div className="flex flex-col items-center gap-2.5">
            <Link href="/dashboard" aria-label="MarkedFox home">
              <FoxMark className="h-[30px]" />
            </Link>
            {collapseButton}
          </div>
        ) : (
          <div className="flex items-center gap-2.5 px-2">
            <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5">
              <FoxMark className="h-[30px] shrink-0" />
              <span className="font-display truncate text-[18px] font-bold tracking-[-0.02em] text-ink">
                MarkedFox
              </span>
            </Link>
            <span className="ml-auto">{collapseButton}</span>
          </div>
        )}

        {/* The one control that starts work rather than reviewing it, so it
            sits above the nav and wears the app's only solid button. */}
        <Link
          href="/dashboard/new-post"
          title={collapsed ? "New post" : undefined}
          className={cx(
            "flex items-center justify-center gap-2 rounded-[14px] bg-ink text-panel transition-[filter] duration-150 hover:brightness-[1.45]",
            collapsed ? "py-[13px]" : "px-3.5 py-[11px]",
          )}
        >
          <Icon
            name="plus"
            className={collapsed ? "h-[22px] w-[22px]" : "h-[17px] w-[17px]"}
            strokeWidth={2.1}
          />
          {collapsed ? (
            <span className="sr-only">New post</span>
          ) : (
            <span className="text-[14.5px] font-semibold">New post</span>
          )}
        </Link>

        <WorkspaceSwitcher
          workspaces={workspaces}
          activeId={activeId}
          canCreate={canCreate}
          createBlockedReason={createBlockedReason}
          remaining={remaining}
          variant={collapsed ? "collapsed" : "full"}
        />

        <SidebarNav sections={sections} collapsed={collapsed} />

        <div className="flex flex-col gap-1 border-t border-line pt-3">
          <NavRow
            href="/dashboard/settings"
            label="Settings"
            icon="settings"
            collapsed={collapsed}
            active={onSettings}
          />
          <Link
            href="/dashboard/settings"
            title={collapsed ? (email ?? "Account") : undefined}
            className={cx(
              "flex items-center gap-2.5 rounded-[13px] transition-[background] duration-150 hover:bg-chip",
              collapsed ? "justify-center py-2" : "px-3 py-2",
            )}
          >
            <span
              aria-hidden
              className="font-display flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-ink text-[13px] font-bold text-panel uppercase"
            >
              {(email ?? "?").trim().charAt(0)}
            </span>
            {collapsed ? (
              <span className="sr-only">{email ?? "Account"}</span>
            ) : (
              <span className="min-w-0">
                <span
                  className="block truncate text-[12.5px] font-semibold text-ink"
                  title={email ?? undefined}
                >
                  {email}
                </span>
                <span className="block text-[11.5px] text-muted capitalize">
                  {planId} plan
                </span>
              </span>
            )}
          </Link>
        </div>
      </div>
    </aside>
  );
}
