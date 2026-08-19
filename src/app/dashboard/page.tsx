import type { Metadata } from "next";

import Link from "next/link";

import { signOut } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/session";
import { listConnections } from "@/lib/connections/store";
import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import { PLATFORM_LABELS as LABELS } from "@/lib/platforms/labels";
import { listRegisteredPlatforms } from "@/lib/platforms/registry";
import { PLATFORMS } from "@/lib/platforms/types";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace, listWorkspaces } from "@/lib/workspaces/store";

import { PlatformToggles, type PlatformRow } from "./platform-toggles";
import { WorkspaceSwitcher } from "./workspace-switcher";

export const metadata: Metadata = { title: "Dashboard · MarkedFox" };

// What each connect failure means, in words the person reading it can act on.
// `provider_error` carries the platform's own sentence in connect_detail
// underneath — that is the one that says what to fix.
const CONNECT_ERRORS: Record<string, string> = {
  denied: "You cancelled before granting access. Nothing was connected.",
  provider_error: "The platform refused the connection.",
  bad_state:
    "That connect link expired or was opened out of order. Start again from this page.",
  missing_code: "The platform sent us back without an authorization code. Try again.",
  exchange_failed: "We could not finish connecting that account.",
  unknown_platform: "That platform is not one we support.",
};

// Everything here reads through the user's own client, so RLS is what returns
// the rows — not a filter this page remembered to apply.
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    connected?: string;
    connect_error?: string;
    connect_detail?: string;
    disconnected?: string;
    disconnect_error?: string;
  }>;
}) {
  const params = await searchParams;
  const user = await requireUser();

  const [workspaces, active] = await Promise.all([
    listWorkspaces(),
    getActiveWorkspace(),
  ]);

  if (!active) {
    // The signup trigger creates a workspace for every user, so this means it
    // did not run — worth saying plainly rather than rendering an empty page.
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-2xl font-semibold">Account setup incomplete</h1>
        <p className="mt-2 text-neutral-400">
          No workspace exists for this account. Contact support.
        </p>
      </main>
    );
  }

  const supabase = await createClient();
  const [snapshot, connections] = await Promise.all([
    getEntitlementSnapshot(supabase, user.id, active.id),
    listConnections(supabase, active.id),
  ]);

  // "Buildable" to the toggle means clicking Connect can actually work: the
  // adapter exists AND the owner has put its credentials in the environment.
  // Registered-but-unconfigured (a developer app not created yet) renders as
  // "Coming soon" — same as no adapter at all, from the user's chair.
  const buildable = new Set(
    listRegisteredPlatforms()
      .filter((a) => a.requiredEnv.every((name) => Boolean(process.env[name])))
      .map((a) => a.id),
  );
  const accountCap = canUserDo(snapshot, {
    type: "connect_platform",
    platform: "instagram",
  });
  const atAccountCap =
    !accountCap.allowed && accountCap.code === "connected_accounts_cap";

  const rows: PlatformRow[] = PLATFORMS.map((platform) => {
    const decision = canUserDo(snapshot, {
      type: "connect_platform",
      platform,
    });
    const included =
      decision.allowed || decision.code !== "plan_platform_locked";

    return {
      id: platform,
      label: LABELS[platform],
      connected: connections
        .filter((c) => c.platform === platform)
        .map((c) => ({
          id: c.id,
          name: c.platform_account_name ?? c.platform_account_id,
        })),
      buildable: buildable.has(platform),
      included,
      reason: included ? undefined : decision.allowed ? undefined : decision.reason,
      atAccountCap: included && atAccountCap,
      capReason: atAccountCap && !accountCap.allowed ? accountCap.reason : undefined,
    };
  });

  const workspaceDecision = canUserDo(snapshot, { type: "create_workspace" });

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-4 py-16">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="mt-1 text-sm text-neutral-400">{user.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <WorkspaceSwitcher
            workspaces={workspaces}
            activeId={active.id}
            canCreate={workspaceDecision.allowed}
            createBlockedReason={
              workspaceDecision.allowed ? undefined : workspaceDecision.reason
            }
          />
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-md border border-neutral-800 px-3 py-1.5 text-sm text-neutral-300 transition hover:border-neutral-600 hover:text-neutral-50"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      {params.connect_error ? (
        <div className="rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">
          <p>{CONNECT_ERRORS[params.connect_error] ?? "Connecting that account did not work."}</p>
          {params.connect_detail ? (
            <p className="mt-1 text-red-200/80">{params.connect_detail}</p>
          ) : null}
        </div>
      ) : null}
      {params.connected ? (
        <p className="rounded-md border border-emerald-900 bg-emerald-950/50 px-3 py-2 text-sm text-emerald-300">
          Connected {params.connected}.
        </p>
      ) : null}
      {params.disconnected ? (
        <p className="rounded-md border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm text-neutral-300">
          Disconnected {params.disconnected}. Its stored tokens are deleted.
        </p>
      ) : null}
      {params.disconnect_error ? (
        <p className="rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">
          That account was not found — it may already be disconnected.
        </p>
      ) : null}

      <nav className="flex gap-2">
        <Link
          href="/dashboard/compose"
          className="rounded-md bg-neutral-50 px-3 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-white"
        >
          Compose a post
        </Link>
        <Link
          href="/dashboard/posts"
          className="rounded-md border border-neutral-800 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-600 hover:text-neutral-50"
        >
          Posts
        </Link>
        <Link
          href="/dashboard/settings"
          className="rounded-md border border-neutral-800 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-600 hover:text-neutral-50"
        >
          Settings
        </Link>
      </nav>

      <section className="rounded-lg border border-neutral-900 p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-neutral-300">Plan</h2>
          <span className="text-lg font-semibold capitalize">
            {snapshot.planId}
          </span>
        </div>

        <p className="mt-1 text-xs text-neutral-500">
          Posts, DMs, and credits are shared across all your workspaces.
          Connected accounts are per workspace.
        </p>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <Stat
            label="Posts today"
            used={snapshot.usage.postsToday}
            limit={snapshot.limits.postsPerDay}
            note="pooled"
          />
          <Stat
            label="X posts this month"
            used={snapshot.usage.xPostsThisMonth}
            limit={snapshot.limits.xPostsPerMonth}
            note="X charges per post — never unlimited"
          />
          <Stat
            label="DM sends this month"
            used={snapshot.usage.dmSendsThisMonth}
            limit={snapshot.limits.dmSendsPerMonth}
            note="pooled"
          />
          <Stat
            label="DM rules"
            used={snapshot.usage.dmRuleCount}
            limit={snapshot.limits.dmRulesMax}
            note="pooled"
          />
          <Stat
            label="Accounts in this workspace"
            used={snapshot.usage.connectedAccountsInWorkspace}
            limit={snapshot.limits.maxConnectedAccountsPerWorkspace}
            note="per workspace"
          />
          <Stat
            label="Workspaces"
            used={snapshot.usage.workspaceCount}
            limit={snapshot.limits.maxWorkspaces}
          />
        </dl>
      </section>

      <section className="rounded-lg border border-neutral-900 p-4">
        <h2 className="text-sm font-medium text-neutral-300">Platforms</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Connecting into <span className="text-neutral-300">{active.name}</span>.
        </p>
        <PlatformToggles rows={rows} />
      </section>
    </main>
  );
}

function Stat({
  label,
  used,
  limit,
  note,
}: {
  label: string;
  used: number;
  limit: number | null;
  note?: string;
}) {
  return (
    <div>
      <dt className="text-neutral-500" title={note}>
        {label}
      </dt>
      <dd>
        {used}
        {limit === null ? " / unlimited" : ` / ${limit}`}
      </dd>
    </div>
  );
}
