import type { Metadata } from "next";

import { LocalTime } from "@/components/local-time";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { PLATFORM_LABELS } from "@/lib/platforms/labels";
import type { Platform } from "@/lib/platforms/types";
import { cancelPostAction } from "@/lib/publish/actions";
import type { PostStatus } from "@/lib/publish/types";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/store";

export const metadata: Metadata = { title: "Posts · MarkedFox" };

type PostListRow = {
  id: string;
  caption: string;
  status: PostStatus;
  scheduled_for: string | null;
  published_at: string | null;
  last_error: string | null;
  created_at: string;
  target_connection_ids: string[];
};

type HistoryRow = {
  scheduled_post_id: string | null;
  platform: Platform;
  outcome: "published" | "failed";
  post_url: string | null;
  error: string | null;
  posted_at: string;
  connection_id: string | null;
};

const STATUS_STYLE: Record<PostStatus, string> = {
  draft: "text-muted border-line",
  scheduled: "text-sky border-sky",
  publishing: "text-warn border-warn",
  published: "text-ok border-ok",
  partial: "text-warn border-warn",
  failed: "text-danger border-danger",
  canceled: "text-faint border-line",
};

// Recent posts in the active workspace with what happened per platform. Reads
// through the user's client, so RLS decides what is listed.
export default async function PostsPage() {
  await requireUser();
  const active = await getActiveWorkspace();
  if (!active) {
    return (
      <>
        <h1 className="text-2xl font-semibold">Account setup incomplete</h1>
      </>
    );
  }

  const supabase = await createClient();
  const { data: postsData, error: postsError } = await supabase
    .from("scheduled_posts")
    .select(
      "id, caption, status, scheduled_for, published_at, last_error, created_at, target_connection_ids",
    )
    .eq("workspace_id", active.id)
    .order("created_at", { ascending: false })
    .limit(30);
  if (postsError) throw postsError;
  const posts = (postsData ?? []) as unknown as PostListRow[];

  const ids = posts.map((p) => p.id);
  let history: HistoryRow[] = [];
  if (ids.length > 0) {
    const { data: historyData, error: historyError } = await supabase
      .from("history")
      .select("scheduled_post_id, platform, outcome, post_url, error, posted_at, connection_id")
      .in("scheduled_post_id", ids)
      .order("posted_at", { ascending: true });
    if (historyError) throw historyError;
    history = (historyData ?? []) as unknown as HistoryRow[];
  }

  // Account names for the target list — one query, then joined here.
  const connectionIds = Array.from(new Set(posts.flatMap((p) => p.target_connection_ids)));
  const names = new Map<string, { platform: Platform; name: string }>();
  if (connectionIds.length > 0) {
    const { data } = await supabase
      .from("connections")
      .select("id, platform, platform_account_name, platform_account_id")
      .in("id", connectionIds);
    for (const c of (data ?? []) as {
      id: string;
      platform: Platform;
      platform_account_name: string | null;
      platform_account_id: string;
    }[]) {
      names.set(c.id, { platform: c.platform, name: c.platform_account_name ?? c.platform_account_id });
    }
  }

  const historyByPost = new Map<string, HistoryRow[]>();
  for (const row of history) {
    if (!row.scheduled_post_id) continue;
    const list = historyByPost.get(row.scheduled_post_id) ?? [];
    list.push(row);
    historyByPost.set(row.scheduled_post_id, list);
  }

  return (
    <>
      <PageHeader
        title="Posts"
        subtitle={
          <>
            In <span className="text-ink">{active.name}</span>, newest
            first — with what happened on each platform.
          </>
        }
        actions={
          <ButtonLink href="/dashboard/compose" tone="primary">
            Compose
          </ButtonLink>
        }
      />

      {posts.length === 0 ? (
        <EmptyState
          title="Nothing yet"
          action={
            <ButtonLink href="/dashboard/compose" tone="primary">
              Compose your first post
            </ButtonLink>
          }
        >
          Published and scheduled posts land here, each showing exactly which
          platform succeeded and which did not.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {posts.map((post) => {
            const rows = historyByPost.get(post.id) ?? [];
            // The label and the timestamp are separate so the time can be
            // formatted in the viewer's timezone rather than the server's.
            const [whenLabel, whenAt] =
              post.status === "scheduled" && post.scheduled_for
                ? (["Scheduled for", post.scheduled_for] as const)
                : post.published_at
                  ? (["Published", post.published_at] as const)
                  : (["Created", post.created_at] as const);
            return (
              <li key={post.id} className="rounded-lg border border-line p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">
                      {post.caption.trim() || <span className="text-faint">(no caption)</span>}
                    </p>
                    <p className="mt-1 text-xs text-faint">
                      {whenLabel} <LocalTime value={whenAt} />
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-xs capitalize ${STATUS_STYLE[post.status]}`}
                  >
                    {post.status}
                  </span>
                </div>

                {rows.length > 0 ? (
                  <ul className="mt-3 flex flex-col gap-1 text-xs">
                    {rows.map((row, i) => {
                      const account = row.connection_id ? names.get(row.connection_id) : undefined;
                      return (
                        <li key={i} className={row.outcome === "published" ? "text-ok" : "text-danger"}>
                          {PLATFORM_LABELS[row.platform]}
                          {account ? ` · ${account.name}` : ""}:{" "}
                          {row.outcome === "published" ? (
                            row.post_url ? (
                              <a href={row.post_url} target="_blank" rel="noreferrer" className="underline">
                                published
                              </a>
                            ) : (
                              "published"
                            )
                          ) : (
                            <>failed — {row.error}</>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : post.status === "scheduled" || post.status === "canceled" ? (
                  <p className="mt-3 text-xs text-faint">
                    To:{" "}
                    {post.target_connection_ids
                      .map((id) => {
                        const account = names.get(id);
                        return account
                          ? `${PLATFORM_LABELS[account.platform]} · ${account.name}`
                          : "(removed account)";
                      })
                      .join(", ")}
                  </p>
                ) : null}

                {post.last_error && rows.length === 0 ? (
                  <p className="mt-2 text-xs text-danger">{post.last_error}</p>
                ) : null}

                {post.status === "scheduled" ? (
                  <form action={cancelPostAction} className="mt-3">
                    <input type="hidden" name="post_id" value={post.id} />
                    <button
                      type="submit"
                      className="rounded-md border border-line px-2 py-1 text-xs text-ink transition hover:border-line-strong"
                    >
                      Cancel
                    </button>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
