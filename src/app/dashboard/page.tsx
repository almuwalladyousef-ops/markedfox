import type { Metadata } from "next";

import { Card, CardTitle, Notice, PageHeader, Stat } from "@/components/ui";
import { signOut } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/session";
import { listConnections } from "@/lib/connections/store";
import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import { PLATFORM_LABELS as LABELS } from "@/lib/platforms/labels";
import { listRegisteredPlatforms } from "@/lib/platforms/registry";
import { PLATFORMS } from "@/lib/platforms/types";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/store";

import { buildSteps, progress } from "@/lib/onboarding/steps";
import { getOnboarding } from "@/lib/onboarding/store";

import { OnboardingPanel } from "./onboarding-panel";
import { PlatformToggles, type PlatformRow } from "./platform-toggles";

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

  const active = await getActiveWorkspace();

  if (!active) {
    // Two ways here: the signup trigger did not run (worth saying plainly),
    // or the account was deleted while this browser still held a session
    // — a JWT verifies locally until it expires, so the cookie outlives the
    // user. Tell them apart by the users row.
    const supabaseForCheck = await createClient();
    const { data: userRow } = await supabaseForCheck.from("users").select("id").eq("id", user.id).maybeSingle();
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-2xl font-semibold">
          {userRow ? "Account setup incomplete" : "This account no longer exists"}
        </h1>
        <p className="mt-2 text-neutral-400">
          {userRow
            ? "No workspace exists for this account. Contact support@markedfox.com."
            : "It was deleted. Sign out to clear this browser's session."}
        </p>
        <form action={signOut} className="mt-4">
          <button
            type="submit"
            className="rounded-md border border-neutral-800 px-3 py-1.5 text-sm text-neutral-300 transition hover:border-neutral-600 hover:text-neutral-50"
          >
            Sign out
          </button>
        </form>
      </main>
    );
  }

  const supabase = await createClient();
  const [snapshot, connections, onboarding] = await Promise.all([
    getEntitlementSnapshot(supabase, user.id, active.id),
    listConnections(supabase, active.id),
    getOnboarding(supabase, user.id),
  ]);

  // Counted rather than read: the checklist ticks a step when the thing is
  // actually true, so it can never disagree with the rest of the dashboard.
  // Head-counts, so this is three cheap queries and no rows.
  const [posts, rules] = await Promise.all([
    supabase
      .from("scheduled_posts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .in("status", ["scheduled", "publishing", "published", "partial"]),
    supabase
      .from("dm_rules")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
  ]);

  const steps = buildSteps({
    connectedPlatforms: connections.map((c) => c.platform),
    postCount: posts.count ?? 0,
    ruleCount: rules.count ?? 0,
    researchSourceCount: snapshot.usage.researchSourceCount,
    planId: snapshot.planId,
    researchAllowed: canUserDo(snapshot, { type: "use_research" }).allowed,
  });
  const { done, total, next } = progress(steps);
  // Hidden once it is finished or dismissed — a permanent checklist of ticks is
  // clutter, and somebody who said "hide this" meant it.
  const showOnboarding = !onboarding?.dismissed && next !== null;

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


  return (
    <>
      <PageHeader
        title="Accounts"
        subtitle={
          <>
            Connecting into{" "}
            <span className="text-neutral-200">{active.name}</span>. Posts, DMs
            and credits are shared across all your workspaces; connected
            accounts belong to this one.
          </>
        }
      />

      {params.connect_error ? (
        <Notice tone="danger">
          {CONNECT_ERRORS[params.connect_error] ??
            "Connecting that account did not work."}
          {params.connect_detail ? (
            <span className="mt-1 block text-red-200/80">
              {params.connect_detail}
            </span>
          ) : null}
        </Notice>
      ) : null}
      {params.connected ? (
        <Notice tone="ok">Connected {params.connected}.</Notice>
      ) : null}
      {params.disconnected ? (
        <Notice>
          Disconnected {params.disconnected}. Its stored tokens are deleted.
        </Notice>
      ) : null}
      {params.disconnect_error ? (
        <Notice tone="danger">
          That account was not found — it may already be disconnected.
        </Notice>
      ) : null}

      {showOnboarding ? (
        <OnboardingPanel
          steps={steps}
          done={done}
          total={total}
          askQuestions={onboarding === null}
        />
      ) : null}

      <Card>
        <CardTitle
          hint="Pooled figures are shared across every workspace you own."
          action={
            <span className="text-lg font-semibold capitalize">
              {snapshot.planId}
            </span>
          }
        >
          Plan
        </CardTitle>

        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat
            label="Posts today"
            value={limitText(snapshot.usage.postsToday, snapshot.limits.postsPerDay)}
            note="pooled"
          />
          <Stat
            label="X posts this month"
            value={limitText(
              snapshot.usage.xPostsThisMonth,
              snapshot.limits.xPostsPerMonth,
            )}
            note="X charges per post — never unlimited"
          />
          <Stat
            label="DM sends this month"
            value={limitText(
              snapshot.usage.dmSendsThisMonth,
              snapshot.limits.dmSendsPerMonth,
            )}
            note="pooled"
          />
          <Stat
            label="DM rules"
            value={limitText(snapshot.usage.dmRuleCount, snapshot.limits.dmRulesMax)}
            note="pooled"
          />
          <Stat
            label="Accounts here"
            value={limitText(
              snapshot.usage.connectedAccountsInWorkspace,
              snapshot.limits.maxConnectedAccountsPerWorkspace,
            )}
            note="per workspace"
          />
          <Stat
            label="Workspaces"
            value={limitText(
              snapshot.usage.workspaceCount,
              snapshot.limits.maxWorkspaces,
            )}
          />
        </dl>
      </Card>

      <Card>
        <CardTitle hint="Every platform is shown. One outside your plan wears a 💎 and says what upgrading buys.">
          Platforms
        </CardTitle>
        <PlatformToggles rows={rows} />
      </Card>
    </>
  );
}

function limitText(used: number, limit: number | null): string {
  return limit === null ? `${used} / unlimited` : `${used} / ${limit}`;
}
