import type { Metadata } from "next";

import Link from "next/link";

import {
  ButtonLink,
  Card,
  EmptyState,
  Notice,
  PageHeader,
  Pill,
} from "@/components/ui";
import { LocalTime } from "@/components/local-time";
import { requireUser } from "@/lib/auth/session";
import { deleteDraftAction } from "@/lib/publish/actions";
import { PLATFORM_LABELS } from "@/lib/platforms/labels";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/store";

export const metadata: Metadata = { title: "Drafts · MarkedFox" };

// Posts that are not going anywhere yet.
//
// A draft skipped every publishing check when it was saved, which is the whole
// point of one — so this page shows what is missing rather than pretending the
// row is ready.

type DraftRow = {
  id: string;
  caption: string;
  media: { url: string; type: string }[];
  target_connection_ids: string[];
  scheduled_for: string | null;
  updated_at: string;
};

export default async function DraftsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; deleted?: string }>;
}) {
  const params = await searchParams;
  await requireUser();
  const active = await getActiveWorkspace();
  if (!active) return <Notice>No workspace is selected.</Notice>;

  const supabase = await createClient();
  const [{ data }, { data: connectionRows }] = await Promise.all([
    supabase
      .from("scheduled_posts")
      .select("id, caption, media, target_connection_ids, scheduled_for, updated_at")
      .eq("workspace_id", active.id)
      .eq("status", "draft")
      .order("updated_at", { ascending: false })
      .limit(100),
    supabase
      .from("connections")
      .select("id, platform, platform_account_name, platform_account_id")
      .eq("workspace_id", active.id),
  ]);

  const drafts = (data ?? []) as unknown as DraftRow[];
  const connections = new Map(
    ((connectionRows ?? []) as {
      id: string;
      platform: keyof typeof PLATFORM_LABELS;
      platform_account_name: string | null;
      platform_account_id: string;
    }[]).map((c) => [
      c.id,
      {
        label: PLATFORM_LABELS[c.platform],
        name: c.platform_account_name ?? c.platform_account_id,
      },
    ]),
  );

  return (
    <>
      <PageHeader
        title="Drafts"
        subtitle="Started and not sent. Nothing here is checked until you publish it."
        actions={
          <ButtonLink href="/dashboard/compose" tone="primary">
            New post
          </ButtonLink>
        }
      />

      {params.saved ? <Notice tone="ok">Draft saved.</Notice> : null}
      {params.deleted ? <Notice>Draft deleted.</Notice> : null}

      {drafts.length === 0 ? (
        <EmptyState title="No drafts">
          Press <em>Save draft</em> in the composer and half-written posts wait
          here instead of being lost to a closed tab.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {drafts.map((draft) => {
            const targets = draft.target_connection_ids
              .map((id) => connections.get(id))
              .filter(Boolean) as { label: string; name: string }[];
            return (
              <li key={draft.id}>
                <Card className="flex h-full flex-col gap-3 p-4">
                  <div className="flex items-start gap-3">
                    {draft.media[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={draft.media[0].url}
                        alt=""
                        className="h-16 w-12 shrink-0 rounded-md object-cover"
                      />
                    ) : null}
                    <p className="line-clamp-4 min-w-0 flex-1 text-sm leading-relaxed text-ink">
                      {draft.caption || (
                        <span className="text-faint italic">No caption yet</span>
                      )}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {targets.length === 0 ? (
                      <Pill tone="warn">No accounts chosen</Pill>
                    ) : (
                      targets.map((target, index) => (
                        <Pill key={index}>{target.label}</Pill>
                      ))
                    )}
                    {draft.media.length > 0 ? (
                      <Pill tone="info">
                        {draft.media.length}{" "}
                        {draft.media.length === 1 ? "file" : "files"}
                      </Pill>
                    ) : null}
                    {draft.scheduled_for ? (
                      <Pill tone="accent">
                        for <LocalTime value={draft.scheduled_for} />
                      </Pill>
                    ) : null}
                  </div>

                  <div className="mt-auto flex items-center gap-3 pt-1 text-xs">
                    <Link
                      href={`/dashboard/compose?draft=${draft.id}`}
                      className="text-ink underline-offset-2 hover:underline"
                    >
                      Open
                    </Link>
                    <form action={deleteDraftAction}>
                      <input type="hidden" name="post_id" value={draft.id} />
                      <button
                        type="submit"
                        className="text-faint underline-offset-2 hover:text-danger hover:underline"
                      >
                        Delete
                      </button>
                    </form>
                    <span className="ml-auto text-faint">
                      <LocalTime value={draft.updated_at} mode="date" />
                    </span>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
