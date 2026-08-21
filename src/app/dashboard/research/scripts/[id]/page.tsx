import type { Metadata } from "next";

import Link from "next/link";
import { notFound } from "next/navigation";

import { Pill } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import { configuredModel } from "@/lib/research/generate";
import { deleteScriptDraftAction } from "@/lib/research/studio-actions";
import {
  getScriptDraft,
  listHookTemplates,
} from "@/lib/research/studio-store";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/store";

import { ScriptBuilder } from "./script-builder";

export const metadata: Metadata = { title: "Script · MarkedFox" };

export default async function ScriptDraftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const active = await getActiveWorkspace();
  if (!active) notFound();

  const supabase = await createClient();
  // RLS scopes this: another tenant's draft id returns nothing.
  const draft = await getScriptDraft(supabase, id);
  if (!draft) notFound();

  const [snapshot, hooks] = await Promise.all([
    getEntitlementSnapshot(supabase, user.id, active.id),
    listHookTemplates(supabase, active.id, { limit: 100 }),
  ]);
  if (!canUserDo(snapshot, { type: "use_research" }).allowed) notFound();

  const creditsLeft = Math.max(
    0,
    snapshot.limits.researchCreditsPerMonth -
      snapshot.usage.researchCreditsThisMonth,
  );

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/dashboard/research/scripts"
            className="text-sm text-faint transition hover:text-ink"
          >
            ← Scripts
          </Link>
          <h1 className="mt-1.5 flex items-center gap-2 text-xl font-semibold">
            {draft.title}
            {draft.video_id ? (
              <Link href={`/dashboard/research/${draft.video_id}`}>
                <Pill tone="info">from a video</Pill>
              </Link>
            ) : null}
          </h1>
        </div>
        <form action={deleteScriptDraftAction}>
          <input type="hidden" name="id" value={draft.id} />
          <button
            type="submit"
            className="text-xs text-faint transition hover:text-danger"
          >
            Delete script
          </button>
        </form>
      </div>

      <ScriptBuilder
        draft={draft}
        aiEnabled={configuredModel() !== null}
        creditsLeft={creditsLeft}
        hookTemplates={hooks.map((hook) => ({
          id: hook.id,
          formula: hook.formula,
          sourceHandle: hook.source_handle,
          sourceViews: hook.source_views,
          favorite: hook.favorite,
        }))}
      />
    </>
  );
}
