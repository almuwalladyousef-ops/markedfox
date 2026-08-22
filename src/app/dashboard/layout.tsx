import Link from "next/link";
import { cookies } from "next/headers";
import type { ReactNode } from "react";

import { FoxMark } from "@/components/ui";
import { ThemeToggle } from "@/components/theme-toggle";
import { signOut } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/session";
import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import { countInboxIdeas } from "@/lib/research/studio-store";
import { createClient } from "@/lib/supabase/server";
import { normalizeTheme, THEME_COOKIE } from "@/lib/theme";
import { getActiveWorkspace, listWorkspaces } from "@/lib/workspaces/store";

import { MobileTabs } from "./mobile-tabs";
import { SidebarNav, type NavSection } from "./sidebar-nav";
import { WorkspaceSwitcher } from "./workspace-switcher";

// One shell for the whole dashboard. Until this existed every page drew its own
// header, its own back-link to /dashboard, and its own max-width, which is why
// moving between the publisher and the research pages felt like moving between
// two products.
//
// The nav is grouped by what the person is doing rather than by which pillar
// the code belongs to: publishing, automating, researching, writing, and the
// setup that feeds all three.

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUser();
  const [workspaces, active, cookieStore] = await Promise.all([
    listWorkspaces(),
    getActiveWorkspace(),
    cookies(),
  ]);

  // No workspace is a real state (the signup trigger failed, or the account was
  // deleted while this browser kept its cookie). The page itself explains it —
  // the shell just gets out of the way rather than rendering a nav to pages
  // that would all fail the same way.
  if (!active) return <>{children}</>;

  const supabase = await createClient();
  const snapshot = await getEntitlementSnapshot(supabase, user.id, active.id);
  const research = canUserDo(snapshot, { type: "use_research" });
  // The badge is the reason the count is fetched at all: an idea queue nobody
  // can see the depth of is a queue nobody empties.
  const inbox = research.allowed ? await countInboxIdeas(supabase, active.id) : 0;

  const sections: NavSection[] = [
    {
      title: "Overview",
      items: [{ href: "/dashboard", label: "Home", icon: "⌂" }],
    },
    {
      title: "Publish",
      items: [
        { href: "/dashboard/compose", label: "Compose", icon: "✎" },
        // The calendar is the whole record of what is going out and what went
        // out, which is why there is no separate Posts list beside it.
        { href: "/dashboard/calendar", label: "Calendar", icon: "▤" },
        { href: "/dashboard/drafts", label: "Drafts", icon: "☰" },
      ],
    },
    {
      title: "Automate",
      items: [
        { href: "/dashboard/automations", label: "Automations", icon: "⚡" },
        { href: "/dashboard/automations/templates", label: "Templates", icon: "◈" },
      ],
    },
    {
      title: "Research",
      items: [
        {
          href: "/dashboard/research",
          label: "Videos",
          icon: "▶",
          locked: !research.allowed,
        },
        {
          href: "/dashboard/research/ideas",
          label: "Ideas",
          icon: "◇",
          badge: inbox,
          locked: !research.allowed,
        },
        {
          href: "/dashboard/research/hooks",
          label: "Hooks",
          icon: "⚿",
          locked: !research.allowed,
        },
      ],
    },
    {
      title: "Create",
      items: [
        { href: "/dashboard/research/scripts", label: "Scripts", icon: "✍", locked: !research.allowed },
        { href: "/dashboard/research/projects", label: "Projects", icon: "🗂", locked: !research.allowed },
      ],
    },
    {
      title: "Setup",
      items: [
        { href: "/dashboard/research/channels", label: "Channels", icon: "◎", locked: !research.allowed },
        { href: "/dashboard/research/persona", label: "Persona", icon: "☺", locked: !research.allowed },
        { href: "/dashboard/research/rules", label: "Auto-analyze", icon: "⟳", locked: !research.allowed },
        { href: "/dashboard/accounts", label: "Accounts", icon: "⊕" },
        { href: "/dashboard/settings", label: "Settings", icon: "⚙" },
      ],
    },
  ];

  const workspaceDecision = canUserDo(snapshot, { type: "create_workspace" });
  const workspacesLeft =
    snapshot.limits.maxWorkspaces === null
      ? null
      : Math.max(
          0,
          snapshot.limits.maxWorkspaces - snapshot.usage.workspaceCount,
        );
  const theme = normalizeTheme(cookieStore.get(THEME_COOKIE)?.value);

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col gap-4 border-r border-line bg-panel px-3 py-[18px] shell:flex">
        <Link href="/dashboard" className="flex items-center gap-[9px] px-2">
          <FoxMark className="h-7" />
          <span className="font-display text-base font-bold tracking-[-0.02em] text-ink">
            MarkedFox
          </span>
        </Link>

        <WorkspaceSwitcher
          workspaces={workspaces}
          activeId={active.id}
          canCreate={workspaceDecision.allowed}
          createBlockedReason={
            workspaceDecision.allowed ? undefined : workspaceDecision.reason
          }
          remaining={workspacesLeft}
        />

        <SidebarNav sections={sections} />

        <div className="flex flex-col gap-1.5 border-t border-line px-1.5 pt-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[11.5px] text-muted" title={user.email ?? undefined}>
                {user.email}
              </p>
              <p className="mt-0.5 text-[11px] text-faint capitalize">
                {snapshot.planId} plan
              </p>
            </div>
            <ThemeToggle initial={theme} />
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="text-left text-[11.5px] text-faint transition hover:text-ink"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Below 880px the sidebar is replaced by a fixed bottom tab bar; this
          strip keeps the brand and the workspace switcher reachable, since
          neither belongs in a five-item tab bar. */}
      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-panel px-4 py-3 shell:hidden">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2">
            <FoxMark className="h-6 shrink-0" />
            {/* The wordmark is the first thing to go on a narrow phone: the
                mark alone still says whose app this is, and the workspace
                switcher beside it is the control people actually press. */}
            <span className="font-display hidden text-[15px] font-bold tracking-[-0.02em] min-[420px]:inline">
              MarkedFox
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <div className="w-36">
              <WorkspaceSwitcher
                workspaces={workspaces}
                activeId={active.id}
                canCreate={workspaceDecision.allowed}
                createBlockedReason={
                  workspaceDecision.allowed ? undefined : workspaceDecision.reason
                }
                remaining={workspacesLeft}
              />
            </div>
            <ThemeToggle initial={theme} />
          </div>
        </div>

        <main className="mx-auto flex w-full flex-col gap-4 px-4 pt-6 pb-[110px] shell:px-9 shell:pt-8 shell:pb-14">
          {children}
        </main>

        <MobileTabs />
      </div>
    </div>
  );
}
