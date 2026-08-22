"use client";

import Link from "next/link";
import { useState } from "react";

import { FoxMark, cx } from "@/components/ui";
import { ThemeToggle } from "@/components/theme-toggle";
import { signOut } from "@/lib/auth/actions";
import { SIDEBAR_COOKIE, type SidebarState } from "@/lib/sidebar";
import type { Theme } from "@/lib/theme";
import type { Workspace } from "@/lib/workspaces/store";

import { SidebarNav, type NavSection } from "./sidebar-nav";
import { WorkspaceSwitcher } from "./workspace-switcher";

// The sidebar as a floating panel rather than a wall: its own rounded card
// with the page scrolling beside it.
//
// It is a client component so collapsing is instant — the width is state here
// and a cookie for the next request, which is what keeps the server's first
// paint the same width the person left it at. The server action for signing
// out is imported directly; a form in a client component may post to one.

function MenuIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      className="h-[15px] w-[15px]"
      aria-hidden
    >
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function Sidebar({
  sections,
  workspaces,
  activeId,
  canCreate,
  createBlockedReason,
  remaining,
  email,
  planId,
  theme,
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
  theme: Theme;
  initial: SidebarState;
}) {
  const [state, setState] = useState<SidebarState>(initial);
  const collapsed = state === "collapsed";

  const toggle = () => {
    const next: SidebarState = collapsed ? "open" : "collapsed";
    setState(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next};path=/;max-age=31536000;samesite=lax`;
  };

  return (
    <aside
      className={cx(
        "sticky top-0 hidden h-screen shrink-0 flex-col gap-4 py-3 pl-3 shell:flex",
        // A width transition rather than a jump: the page beside it reflows
        // either way, and a jump reads as a reload.
        "transition-[width] duration-200",
        collapsed ? "w-[76px]" : "w-[232px]",
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 rounded-[22px] border border-line bg-panel px-2.5 py-4">
        <Link
          href="/dashboard"
          className={cx(
            "flex items-center gap-2",
            collapsed ? "justify-center" : "px-2",
          )}
        >
          <FoxMark className="h-7 shrink-0" />
          {collapsed ? null : (
            <span className="font-display text-[17px] font-bold tracking-[-0.02em] text-ink">
              MarkedFox
            </span>
          )}
        </Link>

        {/* The one control that starts work rather than reviewing it, so it
            sits above the nav and wears the app's only solid button. */}
        <Link
          href="/dashboard/new-post"
          title={collapsed ? "New post" : undefined}
          className={cx(
            "flex items-center gap-2.5 rounded-[14px] bg-ink text-panel transition hover:brightness-110",
            collapsed ? "justify-center p-1.5" : "px-2 py-1.5",
          )}
        >
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[11px] bg-panel/15 text-[15px]"
          >
            +
          </span>
          {collapsed ? (
            <span className="sr-only">New post</span>
          ) : (
            <span className="text-[13.5px] font-semibold">New post</span>
          )}
        </Link>

        {collapsed ? null : (
          <WorkspaceSwitcher
            workspaces={workspaces}
            activeId={activeId}
            canCreate={canCreate}
            createBlockedReason={createBlockedReason}
            remaining={remaining}
          />
        )}

        <SidebarNav sections={sections} collapsed={collapsed} />

        <div
          className={cx(
            "flex flex-col gap-2 border-t border-line pt-3",
            collapsed ? "items-center px-0" : "px-2",
          )}
        >
          <div
            className={cx(
              "flex w-full items-center gap-2",
              collapsed ? "justify-center" : "justify-between",
            )}
          >
            <button
              type="button"
              onClick={toggle}
              aria-expanded={!collapsed}
              title={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
              aria-label={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
              className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg border border-line text-muted transition hover:border-line-strong hover:text-ink"
            >
              <MenuIcon />
            </button>
            {collapsed ? null : <ThemeToggle initial={theme} />}
          </div>

          {collapsed ? (
            <ThemeToggle initial={theme} />
          ) : (
            <>
              <div className="min-w-0">
                <p className="truncate text-[11.5px] text-muted" title={email ?? undefined}>
                  {email}
                </p>
                <p className="mt-0.5 text-[11px] text-faint capitalize">
                  {planId} plan
                </p>
              </div>
              <form action={signOut}>
                <button
                  type="submit"
                  className="text-left text-[11.5px] text-faint transition hover:text-ink"
                >
                  Sign out
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
