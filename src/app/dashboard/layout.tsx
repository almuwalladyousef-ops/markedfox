import { cookies } from "next/headers";
import type { ReactNode } from "react";

import { requireUser } from "@/lib/auth/session";
import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import type { EntitlementSnapshot } from "@/lib/entitlements/types";
import { countInboxIdeas } from "@/lib/research/studio-store";
import { isRowItem, SHELL_SPACES, type ShellSpace } from "@/lib/shell";
import { createClient } from "@/lib/supabase/server";
import { normalizeTheme, THEME_COOKIE } from "@/lib/theme";
import { getActiveWorkspace, listWorkspaces } from "@/lib/workspaces/store";

import { MobileShell } from "./mobile-shell";
import { MobileTabs } from "./mobile-tabs";
import type { DecoratedSpace, SpaceMeter } from "./shell-types";
import { Sidebar } from "./sidebar";

// One shell for the whole dashboard: the icon dock, the contextual rail, and
// their mobile equivalents. The space map itself is static data in lib/shell;
// this layout decorates it with what only the server knows — plan locks, the
// idea-inbox badge, and each space's usage meter — and hands the result to
// the client components.
//
// Settings is not a space: it lives behind the dock's own bottom button, and
// the user row and plan label that used to sit in the sidebar footer live
// inside it.

function pct(used: number, limit: number): number {
  return Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
}

const fmt = (n: number) => n.toLocaleString("en-US");

// Each space's meter, real numbers from the entitlement snapshot. The X
// caveat travels with the word "unlimited" wherever it appears — house rule.
function meterFor(
  id: ShellSpace["id"],
  snapshot: EntitlementSnapshot,
): SpaceMeter {
  const planName =
    snapshot.planId.charAt(0).toUpperCase() + snapshot.planId.slice(1);
  const { limits, usage } = snapshot;

  if (id === "home") {
    if (limits.postsPerDay === null) {
      return {
        title: "Posts today",
        note:
          limits.xPostsPerMonth > 0
            ? `Unlimited on ${planName}. X capped at ${fmt(limits.xPostsPerMonth)}/mo.`
            : `Unlimited on ${planName}. X is not included.`,
        pct: null,
      };
    }
    return {
      title: "Posts today",
      note: `${fmt(usage.postsToday)} of ${fmt(limits.postsPerDay)} in the last 24 hours.`,
      pct: pct(usage.postsToday, limits.postsPerDay),
    };
  }

  if (id === "automate") {
    return {
      title: "DM sends",
      note: `${fmt(usage.dmSendsThisMonth)} of ${fmt(limits.dmSendsPerMonth)} this month across all rules.`,
      pct: pct(usage.dmSendsThisMonth, limits.dmSendsPerMonth),
    };
  }

  if (limits.researchCreditsPerMonth === 0) {
    return {
      title: "Research credits",
      note: "On Studio — credits are pooled across workspaces.",
      pct: null,
    };
  }
  return {
    title: "Research credits",
    note: `${fmt(usage.researchCreditsThisMonth)} of ${fmt(limits.researchCreditsPerMonth)} used this cycle. Pooled across workspaces.`,
    pct: pct(usage.researchCreditsThisMonth, limits.researchCreditsPerMonth),
  };
}

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

  const spaces: DecoratedSpace[] = SHELL_SPACES.map((space) => {
    const firstHref = space.rows.filter(isRowItem)[0].href;
    return {
      id: space.id,
      label: space.label,
      icon: space.icon,
      tip: space.tip,
      title: space.title,
      sub: space.sub,
      firstHref,
      meter: meterFor(space.id, snapshot),
      rows: space.rows.map((row) =>
        isRowItem(row)
          ? {
              ...row,
              locked: space.id === "studio" && !research.allowed,
              badge:
                row.href === "/dashboard/research/ideas" && inbox
                  ? inbox
                  : undefined,
            }
          : row,
      ),
    };
  });

  const workspaceDecision = canUserDo(snapshot, { type: "create_workspace" });
  const workspacesLeft =
    snapshot.limits.maxWorkspaces === null
      ? null
      : Math.max(
          0,
          snapshot.limits.maxWorkspaces - snapshot.usage.workspaceCount,
        );
  const theme = normalizeTheme(cookieStore.get(THEME_COOKIE)?.value);

  const workspaceProps = {
    workspaces,
    activeId: active.id,
    canCreate: workspaceDecision.allowed,
    createBlockedReason: workspaceDecision.allowed
      ? undefined
      : workspaceDecision.reason,
    remaining: workspacesLeft,
  };

  return (
    <div className="flex min-h-screen">
      {/* For keyboard and screen-reader users: the sidebar is ~40 tab stops,
          and this is the only way past them that is not pressing Tab 40
          times. Visually hidden until focused. */}
      <a
        href="#mf-main"
        className="sr-only z-50 rounded-lg bg-panel px-4 py-2.5 text-[14.5px] font-semibold text-ink shadow-e2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <Sidebar spaces={spaces} {...workspaceProps} />

      <div className="min-w-0 flex-1">
        <MobileShell spaces={spaces} {...workspaceProps} theme={theme} />

        <main
          id="mf-main"
          className="mx-auto flex w-full flex-col gap-6 px-4 pt-5 pb-[120px] shell:px-10 shell:pt-9 shell:pb-16"
        >
          {children}
        </main>

        <MobileTabs />
      </div>
    </div>
  );
}
