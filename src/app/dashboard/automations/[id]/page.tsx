import type { Metadata } from "next";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

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
    <>
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Edit rule</h1>
          <p className="mt-1 text-sm text-neutral-400">{rule.name}</p>
        </div>
        <Link href="/dashboard/automations" className="rounded-md border border-neutral-800 px-3 py-1.5 text-sm text-neutral-300 transition hover:border-neutral-600 hover:text-neutral-50">
          Back
        </Link>
      </header>
      <RuleBuilder accounts={accounts} rule={rule} />
    </>
  );
}
