import type { Metadata } from "next";

import { Notice, PageHeader, UpgradeCard } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import { getPersona } from "@/lib/research/studio-store";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/store";

import { PersonaForm } from "./persona-form";

export const metadata: Metadata = { title: "Persona · MarkedFox" };

// One row per workspace, because a workspace is one brand.
//
// Generation without a persona produces competent copy for nobody in
// particular. This is the cheapest quality lever in the whole pillar: four
// sentences, written once, appended to every prompt afterwards.

export default async function PersonaPage() {
  const user = await requireUser();
  const active = await getActiveWorkspace();
  if (!active) return <Notice>No workspace is selected.</Notice>;

  const supabase = await createClient();
  const snapshot = await getEntitlementSnapshot(supabase, user.id, active.id);
  const allowed = canUserDo(snapshot, { type: "use_research" });
  if (!allowed.allowed) {
    return (
      <>
        <PageHeader title="Persona" />
        <UpgradeCard title="Studio" reason={allowed.reason}>
          Tell MarkedFox who you make videos for and how you sound, once. Every
          hook, outline and script it writes afterwards is shaped by it.
        </UpgradeCard>
      </>
    );
  }

  const persona = await getPersona(supabase, active.id);

  return (
    <>
      <PageHeader
        title="Persona"
        subtitle={`Who ${active.name} makes videos for, and how it sounds. Written once, used by every generation afterwards.`}
      />
      <PersonaForm persona={persona} />
    </>
  );
}
