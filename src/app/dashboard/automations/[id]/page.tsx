import type { Metadata } from "next";
import Link from "next/link";

import { notFound, redirect } from "next/navigation";

import { Page, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { builderAccounts } from "@/lib/dm/builder-accounts";
import { parseRuleRow } from "@/lib/dm/rules";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/store";

import { RuleBuilder } from "../rule-builder";

export const metadata: Metadata = { title: "Edit rule · MarkedFox" };

export default async function EditRulePage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const active = await getActiveWorkspace();
  if (!active) redirect("/dashboard");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  // RLS: a rule id belonging to someone else reads as nothing.
  const supabase = await createClient();
  const { data } = await supabase
    .from("dm_rules")
    .select("id, user_id, workspace_id, connection_id, name, enabled, trigger_type, keywords, target_post_ids, actions, config")
    .eq("id", id)
    .maybeSingle();
  const rule = data ? parseRuleRow(data as Record<string, unknown>) : null;
  if (!rule) notFound();

  const accounts = await builderAccounts(rule.workspace_id);

  return (
    <Page width="max-w-[1060px]">
      <Link
        href="/dashboard/automations"
        className="text-[12.5px] font-medium text-faint transition-colors hover:text-ink"
      >
        ← Automations
      </Link>
      <PageHeader title="Edit automation" subtitle={rule.name} />
      <RuleBuilder accounts={accounts} rule={rule} />
    </Page>
  );
}
