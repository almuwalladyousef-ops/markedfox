import Link from "next/link";
import { cookies } from "next/headers";
import type { ReactNode } from "react";

import { FoxMark } from "@/components/ui";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireUser } from "@/lib/auth/session";
import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import { countInboxIdeas } from "@/lib/research/studio-store";
import { createClient } from "@/lib/supabase/server";
import { normalizeSidebar, SIDEBAR_COOKIE } from "@/lib/sidebar";
import { normalizeTheme, THEME_COOKIE } from "@/lib/theme";
import { getActiveWorkspace, listWorkspaces } from "@/lib/workspaces/store";

import { MobileTabs } from "./mobile-tabs";
import { Sidebar } from "./sidebar";
import type { NavSection } from "./sidebar-nav";
import { WorkspaceSwitcher } from "./workspace-switcher";

// One shell for the whole dashboard. Until this existed every page drew its own
// header, its own back-link to /dashboard, and its own max-width, which is why
// moving between the publisher and the research pages felt like moving between
// two products.
//
// The nav is grouped by what the person is doing rather than by which pillar
// the code belongs to: publishing, automating, researching, writing, and the
// setup that feeds all three. Settings sits in the rail's footer rather than
// in a group, because it is not one of those things — and connected accounts
// moved inside it, since "which accounts am I posting from" is setup a person
// visits twice and then forgets.

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
      items: [{ href: "/dashboard", label: "Home", icon: "home" }],
    },
    {
      title: "Publish",
      items: [
        // The calendar is the whole record of what is going out and what went
        // out, which is why there is no separate Posts list beside it.
        { href: "/dashboard/calendar", label: "Calendar", icon: "calendar" },
        { href: "/dashboard/drafts", label: "Drafts", icon: "drafts" },
      ],
    },
    {
      title: "Automate",
      items: [
        { href: "/dashboard/automations", label: "Automations", icon: "automations" },
        {
          href: "/dashboard/automations/templates",
          label: "Templates",
          icon: "templates",
        },
      ],
    },
    {
      title: "Research",
      items: [
        {
          href: "/dashboard/research",
          label: "Videos",
          icon: "videos",
          locked: !research.allowed,
        },
        {
          href: "/dashboard/research/ideas",
          label: "Ideas",
          icon: "ideas",
          badge: inbox,
          locked: !research.allowed,
        },
      ],
    },
    {
      title: "Create",
      items: [
        {
          href: "/dashboard/research/scripts",
          label: "Scripts",
          icon: "scripts",
          locked: !research.allowed,
        },
        {
          href: "/dashboard/research/projects",
          label: "Projects",
          icon: "projects",
          locked: !research.allowed,
        },
        {
          href: "/dashboard/research/hooks",
          label: "Hooks",
          icon: "hooks",
          locked: !research.allowed,
        },
      ],
    },
    {
      title: "Setup",
      items: [
        {
          href: "/dashboard/research/channels",
          label: "Channels",
          icon: "channels",
          locked: !research.allowed,
        },
        {
          href: "/dashboard/research/persona",
          label: "Persona",
          icon: "persona",
          locked: !research.allowed,
        },
        {
          href: "/dashboard/research/rules",
          label: "Auto-analyze",
          icon: "autoanalyze",
          locked: !research.allowed,
        },
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
  // Read here rather than in the client, so the very first paint is already
  // the width this person chose last time.
  const sidebar = normalizeSidebar(cookieStore.get(SIDEBAR_COOKIE)?.value);

  return (
    <div className="flex min-h-screen">
      <Sidebar
        sections={sections}
        workspaces={workspaces}
        activeId={active.id}
        canCreate={workspaceDecision.allowed}
        createBlockedReason={
          workspaceDecision.allowed ? undefined : workspaceDecision.reason
        }
        remaining={workspacesLeft}
        email={user.email ?? null}
        planId={snapshot.planId}
        initial={sidebar}
      />

      {/* Below 880px the sidebar is replaced by a fixed bottom tab bar; this
          strip keeps the brand, the workspace switcher and the theme within
          reach, since none of the three belongs in a four-item tab bar. */}
      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-panel px-[18px] py-3.5 shell:hidden">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5">
            <FoxMark className="h-[26px] shrink-0" />
            {/* The wordmark is the first thing to go on a narrow phone: the
                mark alone still says whose app this is, and the workspace
                switcher beside it is the control people actually press. */}
            <span className="font-display hidden text-[16px] font-bold tracking-[-0.02em] min-[420px]:inline">
              MarkedFox
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <WorkspaceSwitcher
              workspaces={workspaces}
              activeId={active.id}
              canCreate={workspaceDecision.allowed}
              createBlockedReason={
                workspaceDecision.allowed ? undefined : workspaceDecision.reason
              }
              remaining={workspacesLeft}
              variant="compact"
            />
            <ThemeToggle initial={theme} />
          </div>
        </div>

        <main className="mx-auto flex w-full flex-col gap-[22px] px-[18px] pt-7 pb-[120px] shell:px-12 shell:pt-11 shell:pb-[72px]">
          {children}
        </main>

        <MobileTabs />
      </div>
    </div>
  );
}
