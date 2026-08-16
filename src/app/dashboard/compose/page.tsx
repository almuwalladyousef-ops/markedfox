import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth/session";
import { listConnections } from "@/lib/connections/store";
import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import { PLATFORM_LABELS } from "@/lib/platforms/labels";
import { listContentSpecs } from "@/lib/publish/specs";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/store";

import { Composer, type ComposerAccount, type PlatformGate } from "./composer";

export const metadata: Metadata = { title: "Compose · MarkedFox" };

// Server half of the composer: reads what the client needs through the user's
// own client (RLS) and hands it over as plain props. The rules the client
// validates with are the adapters' own — the same ones POST /api/posts
// enforces — so the composer can never be more permissive than the API.
export default async function ComposePage() {
  const user = await requireUser();
  const active = await getActiveWorkspace();
  if (!active) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-2xl font-semibold">Account setup incomplete</h1>
        <p className="mt-2 text-neutral-400">No workspace exists for this account.</p>
      </main>
    );
  }

  const supabase = await createClient();
  const [snapshot, connections] = await Promise.all([
    getEntitlementSnapshot(supabase, user.id, active.id),
    listConnections(supabase, active.id),
  ]);
  const specs = listContentSpecs();

  const accounts: ComposerAccount[] = connections.map((c) => ({
    id: c.id,
    platform: c.platform,
    name: c.platform_account_name ?? c.platform_account_id,
    status: c.status,
    publishable: Boolean(specs[c.platform]),
  }));

  // Structural plan gate per platform (is it on this plan at all?). Caps that
  // move with usage are shown as counters and re-checked by the API.
  const gates: Partial<Record<string, PlatformGate>> = {};
  for (const platform of new Set(connections.map((c) => c.platform))) {
    const decision = canUserDo(snapshot, { type: "publish_post", platform });
    if (!decision.allowed && decision.code === "plan_platform_locked") {
      gates[platform] = { code: decision.code, message: decision.reason };
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-16">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Compose</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Posting from <span className="text-neutral-200">{active.name}</span>
          </p>
        </div>
        <nav className="flex gap-2 text-sm">
          <Link
            href="/dashboard/posts"
            className="rounded-md border border-neutral-800 px-3 py-1.5 text-neutral-300 transition hover:border-neutral-600"
          >
            Posts
          </Link>
          <Link
            href="/dashboard"
            className="rounded-md border border-neutral-800 px-3 py-1.5 text-neutral-300 transition hover:border-neutral-600"
          >
            Dashboard
          </Link>
        </nav>
      </header>

      {accounts.length === 0 ? (
        <section className="rounded-lg border border-neutral-900 p-6 text-sm text-neutral-400">
          No accounts are connected in this workspace yet.{" "}
          <Link href="/dashboard" className="text-neutral-100 underline">
            Connect one on the dashboard
          </Link>{" "}
          and come back.
        </section>
      ) : (
        <Composer
          workspaceId={active.id}
          accounts={accounts}
          specs={specs}
          labels={PLATFORM_LABELS}
          gates={gates}
          planId={snapshot.planId}
          xLinksAllowed={snapshot.limits.xLinksAllowed}
          usage={{
            postsToday: snapshot.usage.postsToday,
            postsPerDay: snapshot.limits.postsPerDay,
            xPostsThisMonth: snapshot.usage.xPostsThisMonth,
            xPostsPerMonth: snapshot.limits.xPostsPerMonth,
          }}
        />
      )}
    </main>
  );
}
