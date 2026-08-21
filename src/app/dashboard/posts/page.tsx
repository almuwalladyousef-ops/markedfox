import type { Metadata } from "next";
import Link from "next/link";

import { LocalTime } from "@/components/local-time";
import {
  ButtonLink,
  Card,
  EmptyState,
  Page,
  PageHeader,
  chipToggle,
} from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { PLATFORM_LABELS } from "@/lib/platforms/labels";
import type { Platform } from "@/lib/platforms/types";
import { cancelPostAction, reschedulePostAction } from "@/lib/publish/actions";
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
  draft: "bg-chip text-muted",
  scheduled: "bg-sky-soft text-sky",
  publishing: "bg-warn-soft text-warn",
  published: "bg-ok-soft text-ok",
  partial: "bg-warn-soft text-warn",
  failed: "bg-danger-soft text-danger",
  canceled: "bg-chip text-faint",
};

// The status tabs. `all` is not a status, and "needs attention" is the one a
// person actually scans for — a post that went out to some platforms and not
// others is easy to miss beside thirty that worked.
const FILTERS = [
  { id: "all", label: "All", statuses: null },
  { id: "scheduled", label: "Scheduled", statuses: ["scheduled", "publishing"] },
  { id: "published", label: "Published", statuses: ["published"] },
  {
    id: "attention",
    label: "Needs attention",
    statuses: ["partial", "failed"],
  },
] as const;

// Recent posts in the active workspace with what happened per platform. Reads
// through the user's client, so RLS decides what is listed.
export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireUser();
  const active = await getActiveWorkspace();
  if (!active) {
    return (
      <Page width="max-w-2xl">
        <h1 className="font-display text-[26px] font-bold tracking-[-0.02em]">
          Account setup incomplete
        </h1>
      </Page>
    );
  }

  const { status } = await searchParams;
  const filter =
    FILTERS.find((option) => option.id === status) ?? FILTERS[0];

  const supabase = await createClient();
  let query = supabase
    .from("scheduled_posts")
    .select(
      "id, caption, status, scheduled_for, published_at, last_error, created_at, target_connection_ids",
    )
    .eq("workspace_id", active.id)
    .order("created_at", { ascending: false })
    .limit(30);
  // Filtered by Postgres rather than in the page, so the limit counts the rows
  // the person asked for.
  if (filter.statuses) query = query.in("status", filter.statuses);
  const { data: postsData, error: postsError } = await query;
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
    <Page width="max-w-[860px]">
      <PageHeader
        title="Posts"
        subtitle={
          <>
            In <span className="text-ink">{active.name}</span>, newest first.
          </>
        }
        actions={
          <ButtonLink href="/dashboard/compose" tone="primary">
            Compose
          </ButtonLink>
        }
      />

      <nav className="flex flex-wrap gap-2">
        {FILTERS.map((option) => (
          <Link
            key={option.id}
            href={
              option.id === "all"
                ? "/dashboard/posts"
                : `/dashboard/posts?status=${option.id}`
            }
            aria-current={option.id === filter.id ? "page" : undefined}
            className={chipToggle(option.id === filter.id)}
          >
            {option.label}
          </Link>
        ))}
      </nav>

      {posts.length === 0 ? (
        <EmptyState
          title="Nothing here"
          action={
            <ButtonLink href="/dashboard/compose" tone="primary">
              Compose your first post
            </ButtonLink>
          }
        >
          {filter.id === "all"
            ? "Published and scheduled posts land here, each showing exactly which platform succeeded and which did not."
            : "The fox found no posts with this status."}
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {posts.map((post) => {
            const rows = historyByPost.get(post.id) ?? [];
            const outcomeByConnection = new Map(
              rows
                .filter((row) => row.connection_id)
                .map((row) => [row.connection_id as string, row.outcome]),
            );
            const failures = rows.filter((row) => row.outcome === "failed");
            // The label and the timestamp are separate so the time can be
            // formatted in the viewer's timezone rather than the server's.
            const [whenLabel, whenAt] =
              post.status === "scheduled" && post.scheduled_for
                ? (["Scheduled for", post.scheduled_for] as const)
                : post.published_at
                  ? (["Published", post.published_at] as const)
                  : (["Created", post.created_at] as const);
            return (
              <li key={post.id}>
                <Card className="px-[18px] py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-sm/[20px] font-medium text-ink">
                        {post.caption.trim() || (
                          <span className="text-faint italic">(no caption)</span>
                        )}
                      </p>
                      <p className="mt-1 text-xs text-faint">
                        {whenLabel} <LocalTime value={whenAt} />
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-[3px] text-[11px] font-semibold capitalize ${STATUS_STYLE[post.status]}`}
                    >
                      {post.status}
                    </span>
                  </div>

                  {/* One chip per target, dotted by that target's own result:
                      the whole point of a partial is knowing which one. */}
                  <ul className="mt-2.5 flex flex-wrap gap-1.5">
                    {post.target_connection_ids.map((id) => {
                      const account = names.get(id);
                      const outcome = outcomeByConnection.get(id);
                      const published = rows.find(
                        (row) => row.connection_id === id && row.post_url,
                      );
                      const dot =
                        outcome === "published"
                          ? "bg-ok"
                          : outcome === "failed"
                            ? "bg-danger"
                            : post.status === "scheduled"
                              ? "bg-sky"
                              : "bg-faint";
                      const label = account
                        ? `${PLATFORM_LABELS[account.platform]} · ${account.name}`
                        : "(removed account)";
                      return (
                        <li key={id}>
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-chip px-2.5 py-1 text-[11px] font-medium text-muted">
                            <span
                              aria-hidden
                              className={`h-1.5 w-1.5 rounded-full ${dot}`}
                            />
                            {published?.post_url ? (
                              <a
                                href={published.post_url}
                                target="_blank"
                                rel="noreferrer"
                                className="underline-offset-2 hover:underline"
                              >
                                {label}
                              </a>
                            ) : (
                              label
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  {failures.length > 0 ? (
                    <ul className="mt-2.5 flex flex-col gap-1 rounded-lg bg-danger-soft px-3 py-2 text-[12px]/[17px] text-danger">
                      {failures.map((row, i) => {
                        const account = row.connection_id
                          ? names.get(row.connection_id)
                          : undefined;
                        return (
                          <li key={i}>
                            {PLATFORM_LABELS[row.platform]}
                            {account ? ` · ${account.name}` : ""}: {row.error}
                          </li>
                        );
                      })}
                    </ul>
                  ) : post.last_error && rows.length === 0 ? (
                    <p className="mt-2.5 rounded-lg bg-danger-soft px-3 py-2 text-[12px]/[17px] text-danger">
                      {post.last_error}
                    </p>
                  ) : null}

                  {post.status === "scheduled" ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <form action={cancelPostAction}>
                        <input type="hidden" name="post_id" value={post.id} />
                        <button
                          type="submit"
                          className="rounded-lg border border-line px-[13px] py-2 text-xs font-medium text-muted transition hover:border-line-strong hover:text-ink"
                        >
                          Cancel
                        </button>
                      </form>
                      {/* A <details> rather than a dialog: no client component
                          for a form that is one field and a button. */}
                      <details className="relative">
                        <summary className="cursor-pointer list-none rounded-lg border border-line px-[13px] py-2 text-xs font-medium text-muted transition hover:border-line-strong hover:text-ink">
                          Edit time
                        </summary>
                        <form
                          action={reschedulePostAction}
                          className="mt-2 flex flex-wrap items-center gap-2"
                        >
                          <input type="hidden" name="post_id" value={post.id} />
                          <input
                            type="datetime-local"
                            name="scheduled_for"
                            required
                            aria-label="New time"
                            className="rounded-[10px] border border-line bg-chip px-3 py-2 text-xs text-ink outline-none focus:border-accent"
                          />
                          <button
                            type="submit"
                            className="rounded-lg bg-accent px-[13px] py-2 text-xs font-semibold text-accent-ink transition hover:brightness-[1.08]"
                          >
                            Move it
                          </button>
                        </form>
                      </details>
                    </div>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
}
