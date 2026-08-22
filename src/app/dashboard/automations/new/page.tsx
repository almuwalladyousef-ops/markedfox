import type { Metadata } from "next";
import Link from "next/link";

import { redirect } from "next/navigation";

import { Page, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { builderAccounts } from "@/lib/dm/builder-accounts";
import { getRuleTemplate } from "@/lib/dm/templates";
import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/store";

import { RuleBuilder } from "../rule-builder";
import { TemplatePicker } from "../template-picker";

export const metadata: Metadata = { title: "New rule · MarkedFox" };

// Two stages behind one "+ New automation": pick a starting point, then build.
//
// A blank builder is the reason most automation tools go unused — people know
// what they want the automation to do and not which trigger expresses it. So
// the first thing this page asks is what it should do, and every answer is a
// real template that fills the builder in.
//
// `?scratch=1` is the deliberate way past it, not a hidden state: somebody who
// has built one of these before should not have to walk through the gallery.
export default async function NewRulePage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; scratch?: string }>;
}) {
  const { template: templateId, scratch } = await searchParams;
  const user = await requireUser();
  const active = await getActiveWorkspace();
  if (!active) redirect("/dashboard");

  const supabase = await createClient();
  const snapshot = await getEntitlementSnapshot(supabase, user.id, active.id);
  const decision = canUserDo(snapshot, { type: "create_dm_rule" });
  if (!decision.allowed) redirect("/dashboard/automations");

  const accounts = await builderAccounts(active.id);
  const template = templateId ? getRuleTemplate(templateId) : null;

  // Stage 1.
  if (!template && !scratch) {
    return (
      <Page>
        <Link
          href="/dashboard/automations"
          className="text-[13px] font-semibold text-faint transition hover:text-ink"
        >
          ← Automations
        </Link>
        <PageHeader
          title="What should it do?"
          subtitle="Pick a starting point. Every one of these is a working automation — you change the words, not the wiring."
        />
        <TemplatePicker />
      </Page>
    );
  }

  // Stage 2.
  return (
    <Page width="max-w-[1080px]">
      <Link
        href="/dashboard/automations/new"
        className="text-[13px] font-semibold text-faint transition hover:text-ink"
      >
        ← Starting points
      </Link>
      <PageHeader
        title="New automation"
        subtitle={
          template
            ? template.description
            : "When something happens on your account, send a DM. The phone shows what the other person sees."
        }
      />
      <RuleBuilder accounts={accounts} template={template} />
    </Page>
  );
}
