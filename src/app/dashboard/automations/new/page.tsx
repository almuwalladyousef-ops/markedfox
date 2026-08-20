import type { Metadata } from "next";

import Link from "next/link";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { builderAccounts } from "@/lib/dm/builder-accounts";
import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/store";

import { RuleBuilder } from "../rule-builder";

export const metadata: Metadata = { title: "New rule · MarkedFox" };

export default async function NewRulePage() {
  const user = await requireUser();
  const active = await getActiveWorkspace();
  if (!active) redirect("/dashboard");

  const supabase = await createClient();
  const snapshot = await getEntitlementSnapshot(supabase, user.id, active.id);
  const decision = canUserDo(snapshot, { type: "create_dm_rule" });
  if (!decision.allowed) redirect("/dashboard/automations");

  const accounts = await builderAccounts(active.id);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-16">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">New rule</h1>
          <p className="mt-1 text-sm text-neutral-400">When something happens, send a DM.</p>
        </div>
        <Link href="/dashboard/automations" className="rounded-md border border-neutral-800 px-3 py-1.5 text-sm text-neutral-300 transition hover:border-neutral-600 hover:text-neutral-50">
          Back
        </Link>
      </header>
      <RuleBuilder accounts={accounts} />
    </main>
  );
}
