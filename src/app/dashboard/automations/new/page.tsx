import type { Metadata } from "next";

import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { builderAccounts } from "@/lib/dm/builder-accounts";
import { getRuleTemplate } from "@/lib/dm/templates";
import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/store";

import { RuleBuilder } from "../rule-builder";

export const metadata: Metadata = { title: "New rule · MarkedFox" };

export default async function NewRulePage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const { template: templateId } = await searchParams;
  const user = await requireUser();
  const active = await getActiveWorkspace();
  if (!active) redirect("/dashboard");

  const supabase = await createClient();
  const snapshot = await getEntitlementSnapshot(supabase, user.id, active.id);
  const decision = canUserDo(snapshot, { type: "create_dm_rule" });
  if (!decision.allowed) redirect("/dashboard/automations");

  const accounts = await builderAccounts(active.id);
  const template = templateId ? getRuleTemplate(templateId) : null;

  return (
    <>
      <PageHeader
        title="New automation"
        subtitle={
          template
            ? template.description
            : "When something happens on your account, send a DM."
        }
        actions={
          <Link
            href="/dashboard/automations/templates"
            className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink transition hover:border-line-strong hover:text-ink"
          >
            Browse templates
          </Link>
        }
      />
      <RuleBuilder accounts={accounts} template={template} />
    </>
  );
}
