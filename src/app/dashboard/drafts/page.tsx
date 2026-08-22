import type { Metadata } from "next";
import Link from "next/link";

import { LocalTime } from "@/components/local-time";
import { PlatformBadge } from "@/components/platform-icon";
import {
  ButtonLink,
  EmptyState,
  Notice,
  Page,
  cx,
} from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { PLATFORM_LABELS } from "@/lib/platforms/labels";
import type { Platform } from "@/lib/platforms/types";
import { deleteDraftAction } from "@/lib/publish/actions";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/store";

export const metadata: Metadata = { title: "Drafts · MarkedFox" };

// Posts that are not going anywhere yet, in the same grid the home screen
// uses for posts that already went out — a draft is a post that has not
// happened, so it should look like one rather than like a database row.
//
// A draft skipped every publishing check when it was saved, which is the whole
// point of one. The tile says what is still missing (no accounts chosen, no
// caption) instead of pretending the row is ready.

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
      platform: Platform;
      platform_account_name: string | null;
      platform_account_id: string;
    }[]).map((c) => [
      c.id,
      {
        platform: c.platform,
        name: c.platform_account_name ?? c.platform_account_id,
      },
    ]),
  );

  return (
    <Page width="max-w-[1080px]">
      <header className="flex flex-wrap items-center gap-3 pt-2">
        <h1 className="font-display text-[26px]/[32px] font-bold tracking-[-0.02em] text-ink">
          Drafts{" "}
          {drafts.length > 0 ? (
            <span className="font-medium text-muted">{drafts.length}</span>
          ) : null}
        </h1>
        <p className="w-full text-[12.5px] text-muted shell:w-auto shell:flex-1">
          Started and not sent. Nothing here is checked until you publish it.
        </p>
        <ButtonLink href="/dashboard/new-post" tone="primary" size="sm">
          + New post
        </ButtonLink>
      </header>

      {params.saved ? <Notice tone="ok">Draft saved.</Notice> : null}
      {params.deleted ? <Notice>Draft deleted.</Notice> : null}

      {drafts.length === 0 ? (
        <EmptyState
          title="No drafts"
          action={
            <ButtonLink href="/dashboard/new-post" tone="primary">
              Start one
            </ButtonLink>
          }
        >
          Press <em>Save draft</em> in the composer and half-written posts wait
          here instead of being lost to a closed tab.
        </EmptyState>
      ) : (
        // The same columns as the home grid, for the same reason: drafts are
        // portrait video, square photos and plain text, and a fixed row height
        // would crop one of them.
        <div className="columns-2 gap-2 shell:columns-3 wide:columns-4 [&>*]:mb-2">
          {drafts.map((draft) => {
            const targets = draft.target_connection_ids
              .map((id) => connections.get(id))
              .filter(Boolean) as { platform: Platform; name: string }[];
            const platforms = [...new Set(targets.map((t) => t.platform))];
            const cover = draft.media[0];

            return (
              <div
                key={draft.id}
                className="group relative break-inside-avoid overflow-hidden rounded-[10px] border border-line bg-chip"
              >
                <Link
                  href={`/dashboard/new-post?draft=${draft.id}`}
                  className="block"
                  title={draft.caption || "Open this draft"}
                >
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={cover.url}
                      alt=""
                      loading="lazy"
                      className={cx(
                        "w-full object-cover transition duration-300 group-hover:brightness-[1.06]",
                        cover.type === "video" ? "aspect-[9/16]" : "aspect-[4/5]",
                      )}
                    />
                  ) : (
                    // No media yet is the common draft, so its words are the
                    // tile — an empty grey rectangle says nothing about which
                    // draft this is.
                    <p className="px-3.5 pt-6 pr-10 pb-10 text-[13px]/[19px] text-ink">
                      {draft.caption.trim() || (
                        <span className="text-faint italic">No caption yet</span>
                      )}
                    </p>
                  )}

                  {cover ? (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/65 to-transparent"
                    />
                  ) : null}

                  <div className="absolute right-2 bottom-2 left-2 flex flex-col gap-1">
                    {cover && draft.caption.trim() ? (
                      <p className="line-clamp-2 text-[11.5px]/[16px] text-white">
                        {draft.caption}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {/* What is still missing, said on the tile: a draft with
                          no target cannot go anywhere, and finding that out at
                          publish time is the thing this line prevents. */}
                      {targets.length === 0 ? (
                        <span
                          className={cx(
                            "rounded-full px-2 py-[3px] text-[10.5px] font-semibold",
                            // Over a photo the soft warn tint disappears into
                            // the scrim, and this is the one line on the tile
                            // that has to be read.
                            cover ? "bg-warn text-black" : "bg-warn-soft text-warn",
                          )}
                        >
                          No accounts chosen
                        </span>
                      ) : null}
                      {draft.scheduled_for ? (
                        <span
                          className={cx(
                            "rounded-full px-2 py-[3px] text-[10.5px] font-semibold",
                            cover
                              ? "bg-black/55 text-white"
                              : "bg-accent-soft text-accent",
                          )}
                        >
                          <LocalTime value={draft.scheduled_for} mode="date" />
                        </span>
                      ) : (
                        <span
                          className={cx(
                            "rounded-full px-2 py-[3px] text-[10.5px] font-semibold",
                            cover ? "bg-black/55 text-white" : "bg-chip text-muted",
                          )}
                        >
                          Draft
                        </span>
                      )}
                      {draft.media.length > 1 ? (
                        <span
                          className={cx(
                            "rounded-full px-2 py-[3px] text-[10.5px] font-semibold",
                            cover ? "bg-black/55 text-white" : "bg-chip text-muted",
                          )}
                        >
                          {draft.media.length} files
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Link>

                <span className="absolute top-2 right-2 flex items-center -space-x-1.5">
                  {platforms.slice(0, 3).map((platform) => (
                    <PlatformBadge
                      key={platform}
                      platform={platform}
                      className="h-6 w-6 rounded-full ring-2 ring-panel"
                      title={PLATFORM_LABELS[platform]}
                    />
                  ))}
                </span>

                {/* Outside the link, because a form inside an anchor is not
                    valid HTML and deleting is not what a click on the tile
                    should ever mean. */}
                <form
                  action={deleteDraftAction}
                  className="absolute top-2 left-2 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100"
                >
                  <input type="hidden" name="post_id" value={draft.id} />
                  <button
                    type="submit"
                    aria-label="Delete this draft"
                    title="Delete this draft"
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-[11px] text-white transition hover:bg-danger"
                  >
                    ✕
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      )}
    </Page>
  );
}
