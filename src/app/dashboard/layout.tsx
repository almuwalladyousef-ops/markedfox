import Link from "next/link";
import type { ReactNode } from "react";

import { signOut } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/session";
import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import { countInboxIdeas } from "@/lib/research/studio-store";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace, listWorkspaces } from "@/lib/workspaces/store";

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
  const [workspaces, active] = await Promise.all([
    listWorkspaces(),
    getActiveWorkspace(),
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
      title: "Publish",
      items: [
        { href: "/dashboard/compose", label: "Compose", icon: "✎" },
        { href: "/dashboard/calendar", label: "Calendar", icon: "▤" },
        { href: "/dashboard/posts", label: "Posts", icon: "◫" },
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
        { href: "/dashboard", label: "Accounts", icon: "⊕" },
        { href: "/dashboard/settings", label: "Settings", icon: "⚙" },
      ],
    },
  ];

  const workspaceDecision = canUserDo(snapshot, { type: "create_workspace" });

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col gap-6 overflow-y-auto border-r border-neutral-900 px-3 py-5 lg:flex">
        <div className="px-1">
          <Link href="/dashboard" className="text-sm font-semibold tracking-tight">
            MarkedFox
          </Link>
          <div className="mt-3">
            <WorkspaceSwitcher
              workspaces={workspaces}
              activeId={active.id}
              canCreate={workspaceDecision.allowed}
              createBlockedReason={
                workspaceDecision.allowed ? undefined : workspaceDecision.reason
              }
            />
          </div>
        </div>

        <SidebarNav sections={sections} />

        <div className="mt-auto flex flex-col gap-1 px-1 pt-4 text-xs text-neutral-500">
          <p className="truncate" title={user.email ?? undefined}>
            {user.email}
          </p>
          <p className="capitalize">{snapshot.planId} plan</p>
          <form action={signOut}>
            <button
              type="submit"
              className="mt-1 text-left text-neutral-500 transition hover:text-neutral-300"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Below `lg` the sidebar is a scrolling strip above the content rather
          than a drawer: a drawer needs state, and every item here fits. */}
      <div className="min-w-0 flex-1">
        <div className="border-b border-neutral-900 px-4 py-3 lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <Link href="/dashboard" className="text-sm font-semibold">
              MarkedFox
            </Link>
            <WorkspaceSwitcher
              workspaces={workspaces}
              activeId={active.id}
              canCreate={workspaceDecision.allowed}
              createBlockedReason={
                workspaceDecision.allowed ? undefined : workspaceDecision.reason
              }
            />
          </div>
          <div className="mt-3 -mx-1 overflow-x-auto">
            <ul className="flex w-max gap-1 px-1">
              {sections
                .flatMap((section) => section.items)
                .map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="block rounded-lg border border-neutral-800 px-3 py-1.5 text-xs whitespace-nowrap text-neutral-300"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
            </ul>
          </div>
        </div>

        <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
