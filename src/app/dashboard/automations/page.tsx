import type { Metadata } from "next";

import Link from "next/link";

import { Icon, PlanDiamond } from "@/components/icons";
import { PlatformTile } from "@/components/platform-icon";
import { ButtonLink, Card, CardTitle, EmptyState, Eyebrow, inputClass, Notice, Page, PageHeader, Pill, textButtonClass, ToggleForm } from "@/components/ui";
import { LocalTime } from "@/components/local-time";
import { requireUser } from "@/lib/auth/session";
import { listConnections, type ConnectionRow } from "@/lib/connections/store";
import {
  deleteRuleAction,
  resubscribeWebhooksAction,
  toggleRuleAction,
} from "@/lib/dm/actions";
import { parseRuleRow } from "@/lib/dm/rules";
import type { DmRule } from "@/lib/dm/types";
import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import { shownCap } from "@/lib/entitlements/types";
import { PLATFORM_LABELS } from "@/lib/platforms/labels";
import { getPlatform, listRegisteredPlatforms } from "@/lib/platforms/registry";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/store";

export const metadata: Metadata = { title: "Automations · MarkedFox" };

// The DM & comment automation home: which accounts have automation on, and
// every rule with the four numbers that say whether it is working. Everything
// reads through the user's client, so RLS is the filter.

type RuleStats = Record<string, Partial<Record<string, number>>>;

type RuleRow = DmRule & { folder: string | null; updated_at: string | null };

export default async function AutomationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    saved?: string;
    deleted?: string;
    connected?: string;
    subscribed?: string;
    resubscribe?: string;
    q?: string;
    trigger?: string;
    status?: string;
  }>;
}) {
  const params = await searchParams;
  const user = await requireUser();
  const active = await getActiveWorkspace();
  if (!active) return <Notice>No workspace is selected.</Notice>;

  const supabase = await createClient();
  const messagingPlatforms = new Set(
    listRegisteredPlatforms()
      .filter((a) => a.messaging)
      .map((a) => a.id),
  );

  const [connections, snapshot, rulesResult, statsResult] = await Promise.all([
    listConnections(supabase, active.id),
    getEntitlementSnapshot(supabase, user.id, active.id),
    supabase
      .from("dm_rules")
      .select(
        "id, user_id, workspace_id, connection_id, name, folder, enabled, trigger_type, keywords, target_post_ids, actions, config, created_at, updated_at",
      )
      .eq("workspace_id", active.id)
      .order("updated_at", { ascending: false }),
    supabase.rpc("dm_rule_stats", { p_workspace_id: active.id }),
  ]);

  const accounts = connections.filter((c) => messagingPlatforms.has(c.platform));
  const allRules = ((rulesResult.data ?? []) as Record<string, unknown>[])
    .map((row) => {
      const rule = parseRuleRow(row);
      return rule
        ? ({
            ...rule,
            folder: (row.folder as string | null) ?? null,
            updated_at: (row.updated_at as string | null) ?? null,
          } satisfies RuleRow)
        : null;
    })
    .filter((r): r is RuleRow => r !== null);

  // Filters are applied here rather than in the query: a workspace has tens of
  // rules, not tens of thousands, and the trigger filter needs the parsed row.
  const search = (params.q ?? "").trim().toLowerCase();
  const rules = allRules.filter((rule) => {
    if (params.trigger && rule.trigger_type !== params.trigger) return false;
    if (params.status === "live" && !rule.enabled) return false;
    if (params.status === "stopped" && rule.enabled) return false;
    if (!search) return true;
    return (
      rule.name.toLowerCase().includes(search) ||
      rule.keywords.some((k) => k.toLowerCase().includes(search)) ||
      (rule.folder ?? "").toLowerCase().includes(search)
    );
  });

  const stats: RuleStats = {};
  for (const row of (statsResult.data ?? []) as {
    rule_id: string;
    kind: string;
    count: number;
  }[]) {
    (stats[row.rule_id] ??= {})[row.kind] = Number(row.count);
  }

  const connectionById = new Map(connections.map((c) => [c.id, c]));
  const canCreate = canUserDo(snapshot, { type: "create_dm_rule" });

  // Folders are a label, so grouping happens here. Ungrouped rules come first:
  // most workspaces never make a folder, and burying their rules under an
  // "Other" heading would be filing for its own sake.
  const folders = new Map<string, RuleRow[]>();
  for (const rule of rules) {
    const key = rule.folder ?? "";
    const bucket = folders.get(key);
    if (bucket) bucket.push(rule);
    else folders.set(key, [rule]);
  }
  const groups = [...folders.entries()].sort(([a], [b]) =>
    a === "" ? -1 : b === "" ? 1 : a.localeCompare(b),
  );

  return (
    <Page>
      <PageHeader
        title="Automations"
        subtitle={
          <>
            Comment-to-DM, keyword replies, and follow-ups for{" "}
            <span className="text-ink">{active.name}</span>.
          </>
        }
        actions={
          <>
            <ButtonLink href="/dashboard/automations/templates">
              Templates
            </ButtonLink>
            {canCreate.allowed && accounts.length > 0 ? (
              <ButtonLink href="/dashboard/automations/new" tone="primary">
                <Icon name="plus" className="h-4 w-4" strokeWidth={2.1} />
                New automation
              </ButtonLink>
            ) : !canCreate.allowed ? (
              <ButtonLink
                href="/pricing"
                title={canCreate.reason}
                className="border border-warn bg-warn-soft text-warn"
              >
                <PlanDiamond className="h-3 w-3 text-warn" />
                More rules
              </ButtonLink>
            ) : null}
          </>
        }
      />

      {params.saved ? <Notice tone="ok">Rule saved. It is live now.</Notice> : null}
      {params.deleted ? <Notice>Rule deleted.</Notice> : null}
      {params.connected ? (
        <Notice tone="ok">
          Automation turned on for{" "}
          {PLATFORM_LABELS[params.connected as keyof typeof PLATFORM_LABELS] ??
            params.connected}
          {params.subscribed !== undefined
            ? ` — ${params.subscribed} account(s) subscribed to events.`
            : "."}
        </Notice>
      ) : null}
      {params.resubscribe ? (
        params.resubscribe === "subscribed" ? (
          <Notice tone="ok">Webhook subscription refreshed.</Notice>
        ) : (
          <Notice tone="warn">
            Could not refresh the subscription:{" "}
            {params.resubscribe.replace(/^failed:/, "")}
          </Notice>
        )
      ) : null}

      <Card className="px-6 py-5">
        <CardTitle
          hint={
            accounts.length === 0
              ? undefined
              : "Instagram sends this app every comment and message on an account with automation on."
          }
        >
          Accounts
        </CardTitle>
        {accounts.length === 0 ? (
          <p className="mt-2.5 text-[14px]/[21px] text-pretty text-muted">
            Connect an Instagram account on the{" "}
            <Link href="/dashboard/settings/accounts" className="underline">
              dashboard
            </Link>{" "}
            first. Automation runs on Instagram today; Facebook Pages follow.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-line border-t border-line">
            {accounts.map((c) => (
              <AccountRow key={c.id} connection={c} />
            ))}
          </ul>
        )}
      </Card>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <form method="get" className="flex flex-wrap items-center gap-2">
          <input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Search automations"
            className={`${inputClass} w-[200px]!`}
          />
          <select
            name="trigger"
            defaultValue={params.trigger ?? ""}
            className="rounded-md border border-line bg-panel px-2.5 py-2 text-[13px] text-ink outline-none focus:border-accent"
          >
            <option value="">Any trigger</option>
            <option value="comment">Comment</option>
            <option value="dm_keyword">DM</option>
            <option value="story_reply">Story reply</option>
          </select>
          <select
            name="status"
            defaultValue={params.status ?? ""}
            className="rounded-md border border-line bg-panel px-2.5 py-2 text-[13px] text-ink outline-none focus:border-accent"
          >
            <option value="">Any state</option>
            <option value="live">Live</option>
            <option value="stopped">Stopped</option>
          </select>
          <button
            type="submit"
            className="rounded-md border border-line-strong bg-panel px-3.5 py-2 text-[13px] text-ink transition-colors hover:border-accent hover:text-accent"
          >
            Filter
          </button>
        </form>

        <p className="text-[13px] text-faint">
          {snapshot.usage.dmRuleCount}
          {snapshot.limits.dmRulesMax === null
            ? ""
            : ` / ${snapshot.limits.dmRulesMax}`}{" "}
          rules across your workspaces · {snapshot.usage.dmSendsThisMonth}
          {shownCap(snapshot.limits.dmSendsPerMonth) === null
            ? ""
            : ` / ${snapshot.limits.dmSendsPerMonth}`}{" "}
          DMs sent this month (pooled).
        </p>
      </div>

      {allRules.length === 0 ? (
        <EmptyState
          title="No automations yet"
          action={
            accounts.length > 0 ? (
              <ButtonLink href="/dashboard/automations/templates" tone="primary">
                Browse templates
              </ButtonLink>
            ) : null
          }
        >
          The classic one: somebody comments a keyword on your post, they get the
          link in a DM, and a public reply under the comment shows everyone else
          watching that it works.
        </EmptyState>
      ) : rules.length === 0 ? (
        <EmptyState title="Nothing matches those filters" />
      ) : (
        groups.map(([folder, folderRules]) => (
          <section key={folder || "__none"}>
            {folder ? (
              <Eyebrow className="mb-2.5">{folder}</Eyebrow>
            ) : null}
            <ul className="flex flex-col gap-3.5">
              {folderRules.map((rule) => {
                const s = stats[rule.id] ?? {};
                const sent = s.sent ?? 0;
                const clicked = s.clicked ?? 0;
                const account = connectionById.get(rule.connection_id);
                return (
                  <li key={rule.id}>
                    <Card className="px-6 py-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Pill
                              tone={rule.enabled ? "ok" : "neutral"}
                              className="tracking-[0.06em]"
                            >
                              {rule.enabled ? "LIVE" : "STOPPED"}
                            </Pill>
                            <Link
                              href={`/dashboard/automations/${rule.id}`}
                              className="font-display text-[16.5px] font-bold tracking-[-0.01em] text-ink hover:underline"
                            >
                              {rule.name}
                            </Link>
                          </div>

                          {/* The rule as a sentence, with the keywords as the
                              chips they are in the builder — so the list and
                              the builder describe the same thing the same way. */}
                          <p className="mt-2.5 flex flex-wrap items-center gap-2 text-[14px]/[22px] text-muted">
                            <span>
                              {rule.trigger_type === "comment"
                                ? `Someone comments on ${rule.target_post_ids.length ? `${rule.target_post_ids.length} chosen post${rule.target_post_ids.length === 1 ? "" : "s"}` : "any post or reel"}`
                                : rule.trigger_type === "dm_keyword"
                                  ? "Someone sends a DM"
                                  : "Someone replies to a story"}
                            </span>
                            {rule.keywords.length > 0 ? (
                              <>
                                <span className="text-faint">
                                  containing
                                </span>
                                {rule.keywords.map((word) => (
                                  <Pill key={word} className="text-ink">
                                    {word}
                                  </Pill>
                                ))}
                              </>
                            ) : null}
                          </p>

                          <p className="mt-2 text-[13px] text-faint">
                            {account
                              ? `${PLATFORM_LABELS[account.platform]} · ${account.platform_account_name ?? account.platform_account_id}`
                              : "account disconnected"}
                            {rule.updated_at ? (
                              <>
                                {" · edited "}
                                <LocalTime value={rule.updated_at} mode="date" />
                              </>
                            ) : null}
                          </p>
                        </div>

                        <form action={toggleRuleAction} className="shrink-0">
                          <input type="hidden" name="rule_id" value={rule.id} />
                          <input
                            type="hidden"
                            name="enabled"
                            value={rule.enabled ? "false" : "true"}
                          />
                          <ToggleForm
                            on={rule.enabled}
                            label={
                              rule.enabled
                                ? `Stop ${rule.name}`
                                : `Start ${rule.name}`
                            }
                          />
                        </form>
                      </div>

                      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 shell:flex shell:gap-0 shell:divide-x shell:divide-line [&>*]:shell:px-6 [&>*:first-child]:shell:pl-0">
                        <Stat label="Runs" value={s.triggered ?? 0} />
                        <Stat label="Sends" value={sent} />
                        <Stat label="Clicks" value={clicked} accent />
                        <Stat
                          label="CTR"
                          value={sent === 0 ? "—" : `${Math.round((clicked / sent) * 100)}%`}
                          title="Clicks over DMs sent. Undefined until something has been sent."
                        />
                        <Stat
                          label="Emails"
                          value={s.email_captured ?? 0}
                          title="Addresses this rule collected"
                        />
                      </dl>

                      {(s.triggered ?? 0) === 0 ? (
                        <p className="mt-4 text-[13px]/[19px] text-pretty text-faint">
                          No data yet. Ask a friend to{" "}
                          {rule.trigger_type === "comment"
                            ? "comment"
                            : "message"}{" "}
                          {rule.keywords[0]
                            ? `“${rule.keywords[0]}”`
                            : "anything"}{" "}
                          and watch it run.
                        </p>
                      ) : null}

                      <div className="mt-4 flex items-center gap-4 text-[13px]">
                        <Link
                          href={`/dashboard/automations/${rule.id}`}
                          className={textButtonClass}
                        >
                          Edit
                        </Link>
                        <form action={deleteRuleAction}>
                          <input type="hidden" name="rule_id" value={rule.id} />
                          <button
                            type="submit"
                            className="text-faint transition-colors hover:text-danger"
                          >
                            Delete
                          </button>
                        </form>
                        {(s.skipped ?? 0) + (s.failed ?? 0) > 0 ? (
                          <span
                            className="ml-auto text-[13px] text-faint"
                            title="Most often: the person never replied, so Instagram's 24-hour messaging window was never open. Also counts posts over the plan cap, people already answered, and follow-ups skipped because they had already clicked."
                          >
                            {(s.skipped ?? 0) + (s.failed ?? 0)} not sent
                          </span>
                        ) : null}
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </Page>
  );
}

function AccountRow({ connection }: { connection: ConnectionRow }) {
  const adapter = getPlatform(connection.platform);
  const required = adapter.messaging?.requiredScopes ?? [];
  const granted = required.every((scope) => connection.scopes.includes(scope));
  const name = connection.platform_account_name ?? connection.platform_account_id;
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <span className="flex min-w-0 items-center gap-3">
        <PlatformTile platform={connection.platform} size={32} />
        <span className="min-w-0 text-[14px] font-semibold text-ink">
          <span className="truncate">{name}</span>
          <span className="ml-2 font-normal text-faint">
            · {PLATFORM_LABELS[connection.platform]}
          </span>
          {connection.status !== "active" ? (
            <span className="ml-2 text-[13px] font-normal text-danger">
              reconnect needed
            </span>
          ) : null}
        </span>
      </span>
      {granted ? (
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-2 text-[13px] font-semibold text-ok">
            <span aria-hidden className="h-[7px] w-[7px] rounded-full bg-ok" />
            Automation on
          </span>
          <form action={resubscribeWebhooksAction}>
            <input type="hidden" name="connection_id" value={connection.id} />
            <button
              type="submit"
              className="text-[13px] text-faint transition-colors hover:text-ink"
              title="Ask Instagram again to send this account's comments and messages here"
            >
              Refresh events
            </button>
          </form>
        </span>
      ) : (
        <a
          href={`/api/connect/${connection.platform}/start?features=messaging`}
          className="rounded-md border border-line bg-panel px-3.5 py-2 text-[13px] font-semibold text-ink transition-[border-color,color] duration-110 hover:border-accent hover:text-accent"
        >
          Turn on automation
        </a>
      )}
    </li>
  );
}

function Stat({
  label,
  value,
  title,
  accent,
}: {
  label: string;
  value: number | string;
  title?: string;
  /** Clicks is the number the rule exists for, so it wears the accent. */
  accent?: boolean;
}) {
  // Not a box. Five of these sat in a row inside a card inside the page, so a
  // rule's numbers arrived behind three nested rectangles; the row is divided
  // by a hairline instead.
  return (
    <div title={title}>
      <dt className="text-[12.5px] text-faint">{label}</dt>
      <dd
        className={`font-display mt-0.5 text-[20px] font-bold tracking-[-0.02em] ${accent ? "text-accent" : "text-ink"}`}
      >
        {value}
      </dd>
    </div>
  );
}
