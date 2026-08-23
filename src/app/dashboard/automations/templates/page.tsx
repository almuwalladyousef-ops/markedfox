import type { Metadata } from "next";

import Link from "next/link";

import {
  ButtonLink,
  Notice,
  Page,
  PageHeader,
  UpgradeCard,
} from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { builderAccounts } from "@/lib/dm/builder-accounts";

import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/store";

import { TemplatePicker } from "../template-picker";

export const metadata: Metadata = { title: "Templates · MarkedFox" };

// The whole gallery on its own page, for browsing rather than for starting.
// "+ New automation" shows the same grid as its first stage — one component,
// so the two cannot drift into describing the same eight templates
// differently.

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
    <Page>
      <PageHeader
        title="Templates"
        subtitle="Start from an automation that already works, then change the words."
        actions={
          <ButtonLink href="/dashboard/automations/new?scratch=1" tone="primary">
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

      <TemplatePicker showScratch={false} />

    </Page>
  );
}
