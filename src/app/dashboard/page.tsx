import type { Metadata } from "next";

import { signOut } from "@/lib/auth/actions";
import { getDefaultWorkspaceId, requireUser } from "@/lib/auth/session";
import { listConnections } from "@/lib/connections/store";
import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import { listRegisteredPlatforms } from "@/lib/platforms/registry";
import { PLATFORMS } from "@/lib/platforms/types";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard · MarkedFox" };

// Placeholder shell for the real product surface. It exists now to prove the
// Phase 2 chain end to end on live data: verified session, the workspace the
// signup trigger created, the entitlement snapshot joined from subscriptions
// and plans, and canUserDo answering per platform.
//
// Everything here reads through the user's own client, so RLS is what returns
// the rows — not a filter this page remembered to apply.
export default async function DashboardPage() {
  const user = await requireUser();
  const workspaceId = await getDefaultWorkspaceId(user.id);

  if (!workspaceId) {
    // The signup trigger creates a workspace for every user, so this means the
    // trigger did not run — worth showing plainly rather than rendering an
    // empty dashboard that looks fine.
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-neutral-50">
        <h1 className="text-2xl font-semibold">Account setup incomplete</h1>
        <p className="mt-2 text-neutral-400">
          No workspace exists for this account. Contact support.
        </p>
      </main>
    );
  }

  const supabase = await createClient();
  const [snapshot, connections] = await Promise.all([
    getEntitlementSnapshot(supabase, user.id, workspaceId),
    listConnections(supabase, workspaceId),
  ]);
  // Only platforms with a real adapter get a Connect link — a link to a stub
  // would 404 by design.
  const connectable = new Set(listRegisteredPlatforms().map((a) => a.id));

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-4 py-16 text-neutral-50">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="mt-1 text-sm text-neutral-400">{user.email}</p>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-md border border-neutral-800 px-3 py-1.5 text-sm text-neutral-300 transition hover:border-neutral-600 hover:text-neutral-50"
          >
            Sign out
          </button>
        </form>
      </header>

      <section className="rounded-lg border border-neutral-900 p-4">
        <h2 className="text-sm font-medium text-neutral-300">Plan</h2>
        <p className="mt-1 text-lg font-semibold capitalize">
          {snapshot.planId}
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-neutral-500">Posts this week</dt>
            <dd>
              {snapshot.usage.postsThisWeek}
              {snapshot.limits.postsPerWeek === null
                ? " / unlimited"
                : ` / ${snapshot.limits.postsPerWeek}`}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">X posts this month</dt>
            <dd>
              {snapshot.usage.xPostsThisMonth} / {snapshot.limits.xPostsPerMonth}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">DM sends this month</dt>
            <dd>
              {snapshot.usage.dmSendsThisMonth} /{" "}
              {snapshot.limits.dmSendsPerMonth}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">DM rules</dt>
            <dd>
              {snapshot.usage.dmRuleCount}
              {snapshot.limits.dmRulesMax === null
                ? " / unlimited"
                : ` / ${snapshot.limits.dmRulesMax}`}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-neutral-900 p-4">
        <h2 className="text-sm font-medium text-neutral-300">Platforms</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Locked platforms are shown, never hidden — the same canUserDo call
          gates the API.
        </p>
        <ul className="mt-4 flex flex-col gap-2 text-sm">
          {PLATFORMS.map((platform) => {
            const decision = canUserDo(snapshot, {
              type: "connect_platform",
              platform,
            });
            const linked = connections.filter((c) => c.platform === platform);
            return (
              <li
                key={platform}
                className="flex items-center justify-between gap-4"
              >
                <span className="capitalize">
                  {platform}
                  {linked.length > 0 ? (
                    <span className="ml-2 text-xs text-neutral-500">
                      {linked
                        .map((c) => c.platform_account_name ?? c.platform_account_id)
                        .join(", ")}
                    </span>
                  ) : null}
                </span>
                {decision.allowed ? (
                  connectable.has(platform) ? (
                    <a
                      href={`/api/connect/${platform}/start`}
                      className="text-neutral-200 underline-offset-4 hover:underline"
                    >
                      {linked.length > 0 ? "Connect another" : "Connect"}
                    </a>
                  ) : (
                    <span className="text-neutral-500">Coming soon</span>
                  )
                ) : (
                  <span className="text-neutral-600" title={decision.reason}>
                    Locked
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
