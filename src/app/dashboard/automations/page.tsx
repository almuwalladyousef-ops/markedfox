import type { Metadata } from "next";

import Link from "next/link";

import { requireUser } from "@/lib/auth/session";
import { listConnections, type ConnectionRow } from "@/lib/connections/store";
import { deleteRuleAction, resubscribeWebhooksAction, toggleRuleAction } from "@/lib/dm/actions";
import { describeRule } from "@/lib/dm/rule-form";
import { parseRuleRow } from "@/lib/dm/rules";
import type { DmRule } from "@/lib/dm/types";
import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import { PLATFORM_LABELS } from "@/lib/platforms/labels";
import { getPlatform, listRegisteredPlatforms } from "@/lib/platforms/registry";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/store";

export const metadata: Metadata = { title: "Automations · MarkedFox" };

// The DM & comment automation home: which accounts have automation on, the
// rules in this workspace with their numbers, and the way in to the builder.
// Everything reads through the user's client, so RLS is the filter.

type RuleStats = Record<string, Partial<Record<string, number>>>;

export default async function AutomationsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; deleted?: string; connected?: string; subscribed?: string; resubscribe?: string }>;
}) {
  const params = await searchParams;
  const user = await requireUser();
  const active = await getActiveWorkspace();
  if (!active) {
    return (
      <>
        <p>No workspace is selected.</p>
      </>
    );
  }
  const supabase = await createClient();

  const messagingPlatforms = new Set(listRegisteredPlatforms().filter((a) => a.messaging).map((a) => a.id));
  const [connections, snapshot, rulesResult, statsResult] = await Promise.all([
    listConnections(supabase, active.id),
    getEntitlementSnapshot(supabase, user.id, active.id),
    supabase
      .from("dm_rules")
      .select("id, user_id, workspace_id, connection_id, name, enabled, trigger_type, keywords, target_post_ids, actions, config, created_at")
      .eq("workspace_id", active.id)
      .order("created_at", { ascending: false }),
    supabase.rpc("dm_rule_stats", { p_workspace_id: active.id }),
  ]);

  const accounts = connections.filter((c) => messagingPlatforms.has(c.platform));
  const rules = ((rulesResult.data ?? []) as Record<string, unknown>[])
    .map((row) => parseRuleRow(row))
    .filter((r): r is DmRule => r !== null);
  const stats: RuleStats = {};
  for (const row of (statsResult.data ?? []) as { rule_id: string; kind: string; count: number }[]) {
    (stats[row.rule_id] ??= {})[row.kind] = Number(row.count);
  }
  const connectionById = new Map(connections.map((c) => [c.id, c]));
  const canCreate = canUserDo(snapshot, { type: "create_dm_rule" });

  return (
    <>
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Automations</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Comment-to-DM, keyword replies, and follow-ups for{" "}
            <span className="text-neutral-200">{active.name}</span>.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="rounded-md border border-neutral-800 px-3 py-1.5 text-sm text-neutral-300 transition hover:border-neutral-600 hover:text-neutral-50"
        >
          Dashboard
        </Link>
      </header>

      {params.saved ? <Notice tone="ok">Rule saved. It is live now.</Notice> : null}
      {params.deleted ? <Notice tone="neutral">Rule deleted.</Notice> : null}
      {params.connected ? (
        <Notice tone="ok">
          Automation turned on for {PLATFORM_LABELS[params.connected as keyof typeof PLATFORM_LABELS] ?? params.connected}
          {params.subscribed !== undefined ? ` — ${params.subscribed} account(s) subscribed to events.` : "."}
        </Notice>
      ) : null}
      {params.resubscribe ? (
        params.resubscribe === "subscribed" ? (
          <Notice tone="ok">Webhook subscription refreshed.</Notice>
        ) : (
          <Notice tone="warn">Could not refresh the subscription: {params.resubscribe.replace(/^failed:/, "")}</Notice>
        )
      ) : null}

      {/* accounts */}
      <section className="rounded-lg border border-neutral-900 p-4">
        <h2 className="text-sm font-medium text-neutral-300">Accounts</h2>
        {accounts.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-400">
            Connect an Instagram account on the{" "}
            <Link href="/dashboard" className="underline">
              dashboard
            </Link>{" "}
            first. Automation runs on Instagram today; Facebook Pages follow.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {accounts.map((c) => (
              <AccountRow key={c.id} connection={c} />
            ))}
          </ul>
        )}
      </section>

      {/* rules */}
      <section className="rounded-lg border border-neutral-900 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium text-neutral-300">Rules</h2>
            <p className="mt-1 text-xs text-neutral-500">
              {snapshot.usage.dmRuleCount}
              {snapshot.limits.dmRulesMax === null ? "" : ` / ${snapshot.limits.dmRulesMax}`} rules across your workspaces ·{" "}
              {snapshot.usage.dmSendsThisMonth} / {snapshot.limits.dmSendsPerMonth} DMs sent this month (pooled).
            </p>
          </div>
          {canCreate.allowed && accounts.length > 0 ? (
            <Link
              href="/dashboard/automations/new"
              className="rounded-md bg-neutral-50 px-3 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-white"
            >
              New rule
            </Link>
          ) : canCreate.allowed ? null : (
            <Link
              href="/pricing"
              title={canCreate.reason}
              className="rounded-md border border-amber-800/60 bg-amber-950/40 px-3 py-2 text-sm text-amber-300"
            >
              💎 More rules on Pro
            </Link>
          )}
        </div>

        {rules.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-400">
            No rules yet. The classic one: when someone comments a keyword on your post, DM them the
            link and reply publicly so others see it works.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {rules.map((rule) => {
              const s = stats[rule.id] ?? {};
              const account = connectionById.get(rule.connection_id);
              return (
                <li key={rule.id} className="rounded-md border border-neutral-900 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/dashboard/automations/${rule.id}`} className="font-medium text-neutral-100 hover:underline">
                        {rule.name}
                      </Link>
                      <p className="mt-0.5 text-xs text-neutral-500">
                        {account ? `${PLATFORM_LABELS[account.platform]} · ${account.platform_account_name ?? account.platform_account_id}` : "account disconnected"}
                      </p>
                      <p className="mt-1 text-sm text-neutral-300">{describeRule(rule)}</p>
                    </div>
                    <form action={toggleRuleAction} className="shrink-0">
                      <input type="hidden" name="rule_id" value={rule.id} />
                      <input type="hidden" name="enabled" value={rule.enabled ? "false" : "true"} />
                      <button
                        type="submit"
                        aria-label={rule.enabled ? `Pause ${rule.name}` : `Resume ${rule.name}`}
                        className={`relative inline-flex h-5 w-10 items-center rounded-full transition ${rule.enabled ? "bg-emerald-600" : "bg-neutral-700"}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${rule.enabled ? "translate-x-5" : "translate-x-1"}`} />
                      </button>
                    </form>
                  </div>
                  <dl className="mt-3 grid grid-cols-4 gap-2 text-xs">
                    <Stat label="Triggered" value={s.triggered ?? 0} />
                    <Stat label="DMs sent" value={s.sent ?? 0} />
                    <Stat label="Link clicks" value={s.clicked ?? 0} />
                    <Stat label="Skipped" value={(s.skipped ?? 0) + (s.failed ?? 0)} title="Outside the 24-hour window, over the plan cap, or already answered" />
                  </dl>
                  <div className="mt-3 flex items-center gap-3 text-xs">
                    <Link href={`/dashboard/automations/${rule.id}`} className="text-neutral-300 underline-offset-2 hover:underline">
                      Edit
                    </Link>
                    <form action={deleteRuleAction}>
                      <input type="hidden" name="rule_id" value={rule.id} />
                      <button type="submit" className="text-neutral-500 underline-offset-2 hover:text-red-300 hover:underline">
                        Delete
                      </button>
                    </form>
                    {!rule.enabled ? <span className="text-neutral-500">Paused</span> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

function AccountRow({ connection }: { connection: ConnectionRow }) {
  const adapter = getPlatform(connection.platform);
  const required = adapter.messaging?.requiredScopes ?? [];
  const granted = required.every((scope) => connection.scopes.includes(scope));
  const name = connection.platform_account_name ?? connection.platform_account_id;
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-neutral-900 px-3 py-2 text-sm">
      <span>
        <span className="font-medium">{name}</span>
        <span className="ml-2 text-xs text-neutral-500">{PLATFORM_LABELS[connection.platform]}</span>
        {connection.status !== "active" ? <span className="ml-2 text-xs text-red-400">reconnect needed</span> : null}
      </span>
      {granted ? (
        <span className="flex items-center gap-3">
          <span className="text-xs text-emerald-400">Automation on</span>
          <form action={resubscribeWebhooksAction}>
            <input type="hidden" name="connection_id" value={connection.id} />
            <button type="submit" className="text-xs text-neutral-500 underline-offset-2 hover:text-neutral-200 hover:underline" title="Ask Instagram again to send this account's comments and messages here">
              Refresh events
            </button>
          </form>
        </span>
      ) : (
        <a
          href={`/api/connect/${connection.platform}/start?features=messaging`}
          className="rounded-md bg-neutral-50 px-3 py-1.5 text-xs font-semibold text-neutral-950 transition hover:bg-white"
        >
          Turn on automation
        </a>
      )}
    </li>
  );
}

function Stat({ label, value, title }: { label: string; value: number; title?: string }) {
  return (
    <div title={title}>
      <dt className="text-neutral-500">{label}</dt>
      <dd className="text-base text-neutral-100">{value}</dd>
    </div>
  );
}

function Notice({ tone, children }: { tone: "ok" | "warn" | "neutral"; children: React.ReactNode }) {
  const cls =
    tone === "ok"
      ? "border-emerald-900 bg-emerald-950/50 text-emerald-300"
      : tone === "warn"
        ? "border-amber-900 bg-amber-950/40 text-amber-200"
        : "border-neutral-800 bg-neutral-900/60 text-neutral-300";
  return <p className={`rounded-md border px-3 py-2 text-sm ${cls}`}>{children}</p>;
}
