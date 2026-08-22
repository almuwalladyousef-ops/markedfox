import type { Metadata } from "next";

import Link from "next/link";

import {
  Button,
  Card,
  EmptyState,
  Notice,
  Page,
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
      <Page width="max-w-[780px]">
        <PageHeader title="Scripts" />
        <UpgradeCard title="Studio" reason={allowed.reason}>
          Topic, research, hook, style, script — five stages you can walk back
          into, rather than one prompt and whatever it returns.
        </UpgradeCard>
      </Page>
    );
  }

  const drafts = await listScriptDrafts(supabase, active.id);

  return (
    <Page width="max-w-[780px]">
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
                className="flex items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3 transition hover:border-accent"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-semibold text-ink">
                    {draft.title}
                  </span>
                  <span className="block truncate text-[13px] text-faint">
                    {draft.chosen_hook
                      ? `“${draft.chosen_hook}”`
                      : (draft.topic ?? "No topic yet")}
                  </span>
                </span>
                <Pill
                  tone={draft.script ? "ok" : "neutral"}
                  className="text-[12px] font-bold"
                >
                  {draft.script ? "Written" : STAGE_LABELS[draft.stage]}
                </Pill>
                <span className="shrink-0 text-[12.5px] text-faint">
                  <LocalTime value={draft.updated_at} mode="date" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[13px]/[19px] text-faint">
        Or press <em>Create script</em> on any analysed video — the breakdown
        comes with it, so the script is built from a shape that already worked.
      </p>
    </Page>
  );
}
