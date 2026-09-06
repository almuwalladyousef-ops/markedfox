import type { Metadata } from "next";

import {
  Card,
  EmptyState,
  Notice,
  Page,
  PageHeader,
  Pill,
  UpgradeCard,
  cx,
  destructiveButtonClass,
  formatCount,
  textButtonClass,
} from "@/components/ui";
import { LocalTime } from "@/components/local-time";
import { requireUser } from "@/lib/auth/session";
import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import { configuredModel } from "@/lib/research/generate";
import { listSources } from "@/lib/research/store";
import { deleteAutomationAction } from "@/lib/research/studio-actions";
import { listAutomations } from "@/lib/research/studio-store";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/store";

import { AddRule, RuleForm } from "./rule-form";

export const metadata: Metadata = { title: "Auto-analyze · MarkedFox" };

// Analysis that happens while nobody is present.
//
// A standing instruction to spend credits, which is why the daily limit is the
// column that matters more than any threshold: a rule with no ceiling can empty
// a month's allowance into one afternoon on a channel that suddenly posted
// forty times.

export default async function RulesPage() {
  const user = await requireUser();
  const active = await getActiveWorkspace();
  if (!active) return <Notice>No workspace is selected.</Notice>;

  const supabase = await createClient();
  const snapshot = await getEntitlementSnapshot(supabase, user.id, active.id);
  const allowed = canUserDo(snapshot, { type: "use_research" });
  if (!allowed.allowed) {
    return (
      <Page width="max-w-[900px]">
        <PageHeader title="Auto-analyze" />
        <UpgradeCard title="Studio" reason={allowed.reason}>
          Set the bar once — say, anything that tripled its channel&rsquo;s
          average with at least 25,000 views — and MarkedFox breaks those videos
          down as they appear, dropping the ideas in your inbox.
        </UpgradeCard>
      </Page>
    );
  }

  const [rules, sources] = await Promise.all([
    listAutomations(supabase, active.id),
    listSources(supabase, active.id),
  ]);

  const options = sources.map((source) => ({
    id: source.id,
    label: `${source.handle ? `@${source.handle}` : source.title} (${source.platform})`,
  }));
  const byId = new Map(options.map((option) => [option.id, option.label]));

  const creditsLeft = Math.max(
    0,
    snapshot.limits.researchCreditsPerMonth -
      snapshot.usage.researchCreditsThisMonth,
  );
  // Each rule has its own daily ceiling, counted from its own usage rows, so
  // the worst case really is the sum — which is the number worth showing
  // against what is left this month.
  const dailyCeiling = rules
    .filter((rule) => rule.active)
    .reduce((total, rule) => total + rule.daily_limit, 0);

  return (
    <Page width="max-w-[900px]">
      <PageHeader
        title="Auto-analyze"
        subtitle="Automatically break down videos that clear a bar you set, and drop the ideas in your inbox."
        actions={<AddRule sources={options} />}
      />

      {!configuredModel() ? (
        <Notice tone="warn">
          These rules are not running yet. They can be set up now and will
          start on their own once they are.
        </Notice>
      ) : null}

      {dailyCeiling > 0 ? (
        <Notice tone={dailyCeiling * 7 > creditsLeft ? "warn" : "neutral"}>
          Active rules can spend up to {dailyCeiling}{" "}
          {dailyCeiling === 1 ? "credit" : "credits"} a day. You have{" "}
          {creditsLeft} left this month
          {dailyCeiling * 7 > creditsLeft
            ? " — at that rate they will run out inside a week."
            : "."}
        </Notice>
      ) : null}

      {rules.length === 0 ? (
        <EmptyState title="No rules yet">
          A rule watches for videos that clear its thresholds and breaks them
          down without being asked. Useful once you track more channels than you
          can read every morning.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-4">
          {rules.map((rule) => (
            <li key={rule.id}>
              <Card
                className={cx(
                  "px-6 py-5",
                  // An active rule spends credits without being asked, so the
                  // one thing the card has to say at a glance is whether it is
                  // running.
                  rule.active ? "border-accent" : "border-line",
                )}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <Pill
                    tone={rule.active ? "ok" : "neutral"}
                    className="tracking-[0.06em]"
                  >
                    {rule.active ? "ACTIVE" : "PAUSED"}
                  </Pill>
                  <p className="font-display text-[16.5px] font-bold tracking-[-0.01em] text-ink">
                    {rule.name}
                  </p>
                  <p className="text-[13.5px]/[20px] text-muted">
                    {rule.source_id
                      ? (byId.get(rule.source_id) ?? "a deleted channel")
                      : "All channels"}{" "}
                    · at least {Number(rule.min_outlier_score).toFixed(1)}x ·{" "}
                    {formatCount(rule.min_views)} views ·{" "}
                    {Math.round(rule.min_engagement_rate * 1000) / 10}%
                    engagement · up to {rule.daily_limit}/day
                  </p>
                  <form action={deleteAutomationAction} className="ml-auto">
                    <input type="hidden" name="id" value={rule.id} />
                    <button
                      type="submit"
                      className={destructiveButtonClass}
                    >
                      Delete
                    </button>
                  </form>
                </div>
                <p className="mt-2 text-[13px] text-faint">
                  {rule.last_run_at
                    ? <>Last ran <LocalTime value={rule.last_run_at} /></>
                    : "Has not run yet"}
                </p>

                <details className="mt-4">
                  <summary className={cx(textButtonClass, "cursor-pointer")}>
                    Edit
                  </summary>
                  <div className="mt-4">
                    <RuleForm rule={rule} sources={options} />
                  </div>
                </details>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[13px]/[19px] text-pretty text-faint">
        A rule is a standing instruction to spend credits, so the daily limit is
        the column that matters — a rule with no ceiling could empty a
        month&rsquo;s allowance into one afternoon on a channel that suddenly
        posted forty times.
      </p>
    </Page>
  );
}
