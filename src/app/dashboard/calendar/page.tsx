import type { Metadata } from "next";
import { Suspense } from "react";

import { Notice, Page } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import type { Platform } from "@/lib/platforms/types";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/store";

import { CalendarGrid, type CalendarAccount, type CalendarPost } from "./calendar-grid";

export const metadata: Metadata = { title: "Calendar · MarkedFox" };

// Everything with a time on it, in one place: scheduled posts, drafts with a
// date pencilled in, and what already went out — including exactly which
// platform succeeded and which did not. There is no separate Posts list any
// more; a post's whole life is visible where its time is, and the actions that
// used to live on that list (cancel, edit time) are on the post itself here.
//
// The window is deliberately generous — three months back and a year forward —
// and fetched once rather than per view change, because a workspace's whole
// schedule is a few hundred rows and paging the query would make every ‹ ›
// click a round trip.

type Row = {
  id: string;
  caption: string;
  status: string;
  scheduled_for: string | null;
  published_at: string | null;
  last_error: string | null;
  media: { url: string; type: string }[];
  target_connection_ids: string[];
};

type HistoryRow = {
  scheduled_post_id: string | null;
  connection_id: string | null;
  outcome: "published" | "failed";
  post_url: string | null;
  error: string | null;
};

export default async function CalendarPage() {
  await requireUser();
  const active = await getActiveWorkspace();
  if (!active) return <Notice>No workspace is selected.</Notice>;

  const supabase = await createClient();
  const now = new Date();
  const from = new Date(now.getTime() - 92 * 24 * 3600_000).toISOString();
  const to = new Date(now.getTime() + 366 * 24 * 3600_000).toISOString();

  const [{ data }, { data: connectionRows }, { data: profileRows }] =
    await Promise.all([
      supabase
        .from("scheduled_posts")
        .select(
          "id, caption, status, scheduled_for, published_at, last_error, media, target_connection_ids",
        )
        .eq("workspace_id", active.id)
        .or(
          `and(scheduled_for.gte.${from},scheduled_for.lte.${to}),and(published_at.gte.${from},published_at.lte.${to})`,
        )
        .limit(500),
      supabase
        .from("connections")
        .select("id, platform, platform_account_name, platform_account_id")
        .eq("workspace_id", active.id),
      // The avatars in the account filter are the same cached profiles the
      // home screen draws, so the two screens show one identity per account
      // rather than two.
      supabase
        .from("account_profiles")
        .select("connection_id, avatar_url, handle, display_name")
        .eq("workspace_id", active.id),
    ]);

  const rows = (data ?? []) as unknown as Row[];

  const profiles = new Map(
    ((profileRows ?? []) as {
      connection_id: string;
      avatar_url: string | null;
      handle: string | null;
      display_name: string | null;
    }[]).map((row) => [row.connection_id, row]),
  );

  const accounts: CalendarAccount[] = (
    (connectionRows ?? []) as {
      id: string;
      platform: Platform;
      platform_account_name: string | null;
      platform_account_id: string;
    }[]
  ).map((connection) => {
    const profile = profiles.get(connection.id);
    return {
      id: connection.id,
      platform: connection.platform,
      name:
        profile?.handle ??
        profile?.display_name ??
        connection.platform_account_name ??
        connection.platform_account_id,
      avatarUrl: profile?.avatar_url ?? null,
    };
  });
  const accountsById = new Map(accounts.map((account) => [account.id, account]));

  // Per-platform outcomes, so a card can say which target failed without a
  // second page to click through to.
  let history: HistoryRow[] = [];
  if (rows.length > 0) {
    const { data: historyData } = await supabase
      .from("history")
      .select("scheduled_post_id, connection_id, outcome, post_url, error")
      .in(
        "scheduled_post_id",
        rows.map((row) => row.id),
      );
    history = (historyData ?? []) as unknown as HistoryRow[];
  }
  const historyByPost = new Map<string, HistoryRow[]>();
  for (const row of history) {
    if (!row.scheduled_post_id) continue;
    const list = historyByPost.get(row.scheduled_post_id) ?? [];
    list.push(row);
    historyByPost.set(row.scheduled_post_id, list);
  }

  const posts: CalendarPost[] = rows
    // A post's place on the calendar is when it went out, or when it is meant
    // to. One without either is a draft with no date and belongs on /drafts.
    .map((row) => ({ row, at: row.published_at ?? row.scheduled_for }))
    .filter((entry): entry is { row: Row; at: string } => Boolean(entry.at))
    .map(({ row, at }) => {
      const outcomes = historyByPost.get(row.id) ?? [];
      return {
        id: row.id,
        caption: row.caption,
        status: row.status,
        at,
        thumbnail: row.media[0]?.url ?? null,
        lastError: row.last_error,
        targets: row.target_connection_ids.map((connectionId) => {
          const account = accountsById.get(connectionId);
          const outcome = outcomes.find((item) => item.connection_id === connectionId);
          return {
            connectionId,
            platform: account?.platform ?? null,
            name: account?.name ?? "(removed account)",
            outcome: outcome?.outcome ?? null,
            url: outcome?.post_url ?? null,
            error: outcome?.error ?? null,
          };
        }),
      };
    });

  // Full-width rather than the usual reading measure: a month grid squeezed
  // into 1080px wastes the two-thirds of the screen a calendar is for.
  return (
    <Page width="max-w-none">
      {/* The grid reads the view and date from the URL, which needs Suspense
          in an app-router page. */}
      <Suspense fallback={<p className="text-[14px] text-faint">Loading…</p>}>
        <CalendarGrid posts={posts} accounts={accounts} today={now.toISOString()} />
      </Suspense>
    </Page>
  );
}
