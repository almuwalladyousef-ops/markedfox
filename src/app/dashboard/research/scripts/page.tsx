import type { Metadata } from "next";

import Link from "next/link";

import {
  Button,
  Card,
  EmptyState,
  Notice,
  PageHeader,
  Pill,
  UpgradeCard,
  inputClass,
} from "@/components/ui";
import { LocalTime } from "@/components/local-time";
import { requireUser } from "@/lib/auth/session";
import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import { createScriptDraftAction } from "@/lib/research/studio-actions";
import { listScriptDrafts } from "@/lib/research/studio-store";
import { STAGE_LABELS } from "@/lib/research/studio-types";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/store";

export const metadata: Metadata = { title: "Scripts · MarkedFox" };

export default async function ScriptsPage() {
  const user = await requireUser();
  const active = await getActiveWorkspace();
  if (!active) return <Notice>No workspace is selected.</Notice>;

  const supabase = await createClient();
  const snapshot = await getEntitlementSnapshot(supabase, user.id, active.id);
  const allowed = canUserDo(snapshot, { type: "use_research" });
  if (!allowed.allowed) {
    return (
      <>
        <PageHeader title="Scripts" />
        <UpgradeCard title="Studio" reason={allowed.reason}>
          Topic, research, hook, style, script — five stages you can walk back
          into, rather than one prompt and whatever it returns.
        </UpgradeCard>
      </>
    );
  }

  const drafts = await listScriptDrafts(supabase, active.id);

  return (
    <>
      <PageHeader
        title="Scripts"
        subtitle="Every script is five stages you can walk back into: topic, research, hook, style, script."
      />

      <Card className="p-4">
        <form action={createScriptDraftAction} className="flex flex-wrap gap-2">
          <input
            name="topic"
            required
            maxLength={500}
            placeholder="What is this video about?"
            className={`${inputClass} min-w-0 flex-1`}
          />
          <Button type="submit" tone="primary">
            Start a script
          </Button>
        </form>
      </Card>

      {drafts.length === 0 ? (
        <EmptyState title="No scripts yet">
          Start one above, or press <em>Create script</em> on any analysed video
          — that way the breakdown comes with it and the script is built from a
          shape that already worked.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {drafts.map((draft) => (
            <li key={draft.id}>
              <Link
                href={`/dashboard/research/scripts/${draft.id}`}
                className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-950/60 px-4 py-3 transition hover:border-neutral-600"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {draft.title}
                  </span>
                  <span className="block truncate text-xs text-neutral-500">
                    {draft.chosen_hook
                      ? `“${draft.chosen_hook}”`
                      : (draft.topic ?? "No topic yet")}
                  </span>
                </span>
                <Pill tone={draft.script ? "ok" : "neutral"}>
                  {draft.script ? "Written" : STAGE_LABELS[draft.stage]}
                </Pill>
                <span className="shrink-0 text-xs text-neutral-600">
                  <LocalTime value={draft.updated_at} mode="date" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
