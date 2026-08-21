import type { Metadata } from "next";

import Link from "next/link";

import {
  ButtonLink,
  Card,
  Notice,
  Page,
  PageHeader,
  Pill,
  UpgradeCard,
} from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { builderAccounts } from "@/lib/dm/builder-accounts";
import {
  GOAL_LABELS,
  RULE_TEMPLATES,
  TRIGGER_LABELS,
  type TemplateGoal,
} from "@/lib/dm/templates";
import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/store";

export const metadata: Metadata = { title: "Templates · MarkedFox" };

// The entry point to the builder, because a blank builder is the reason most
// automation tools go unused: people know what they want the automation to do
// and not which trigger expresses it.

const GOAL_ORDER: TemplateGoal[] = [
  "traffic",
  "followers",
  "engagement",
  "leads",
];

export default async function TemplatesPage() {
  const user = await requireUser();
  const active = await getActiveWorkspace();
  if (!active) return <Notice>No workspace is selected.</Notice>;

  const supabase = await createClient();
  const [snapshot, accounts] = await Promise.all([
    getEntitlementSnapshot(supabase, user.id, active.id),
    builderAccounts(active.id),
  ]);

  const canCreate = canUserDo(snapshot, { type: "create_dm_rule" });

  return (
    <Page width="max-w-[980px]">
      <PageHeader
        title="Templates"
        subtitle="Start from an automation that already works, then change the words."
        actions={
          <ButtonLink href="/dashboard/automations/new" tone="primary">
            Start from scratch
          </ButtonLink>
        }
      />

      {accounts.length === 0 ? (
        <Notice tone="warn">
          No account has messaging turned on yet. Turn it on from{" "}
          <Link href="/dashboard/automations" className="underline">
            Automations
          </Link>{" "}
          first — a rule needs an account to run on.
        </Notice>
      ) : null}

      {!canCreate.allowed ? (
        <UpgradeCard title="More rules" reason={canCreate.reason}>
          Every template here still opens, so you can see exactly what it does.
          Saving one needs a plan with room for another rule.
        </UpgradeCard>
      ) : null}

      {GOAL_ORDER.map((goal) => {
        const templates = RULE_TEMPLATES.filter(
          (template) => template.goal === goal,
        );
        if (templates.length === 0) return null;
        return (
          <section key={goal}>
            <h2 className="text-[10px] font-bold tracking-[0.12em] text-faint uppercase">
              {GOAL_LABELS[goal]}
            </h2>
            <ul className="mt-3 grid gap-3 shell:grid-cols-3">
              {templates.map((template) => (
                <li key={template.id}>
                  <Link
                    href={`/dashboard/automations/new?template=${template.id}`}
                    className="block h-full"
                  >
                    <Card className="flex h-full flex-col gap-2 p-4 transition hover:border-accent">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13.5px] font-semibold text-ink">
                          {template.name}
                        </p>
                        {template.popular ? (
                          <Pill
                            tone="warn"
                            className="text-[9.5px] font-bold tracking-[0.04em]"
                          >
                            POPULAR
                          </Pill>
                        ) : null}
                      </div>
                      <p className="text-[12.5px]/[18px] text-muted">
                        {template.description}
                      </p>
                      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
                        <Pill tone="info">
                          {TRIGGER_LABELS[template.trigger]}
                        </Pill>
                        {template.needsPaidStep ? (
                          <Pill tone="accent">Collects data</Pill>
                        ) : null}
                      </div>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </Page>
  );
}
