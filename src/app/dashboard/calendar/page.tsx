import type { Metadata } from "next";
import { Suspense } from "react";

import {
  ButtonLink,
  EmptyState,
  Notice,
  Page,
  PageHeader,
} from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { PLATFORM_LABELS } from "@/lib/platforms/labels";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/store";

import { CalendarGrid, type CalendarPost } from "./calendar-grid";

export const metadata: Metadata = { title: "Calendar · MarkedFox" };

// Everything with a time on it, in one place: scheduled posts, drafts with a
// date pencilled in, and what already went out.
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
  media: { url: string; type: string }[];
  target_connection_ids: string[];
};

export default async function CalendarPage() {
  await requireUser();
  const active = await getActiveWorkspace();
  if (!active) return <Notice>No workspace is selected.</Notice>;

  const supabase = await createClient();
  const now = new Date();
  const from = new Date(now.getTime() - 92 * 24 * 3600_000).toISOString();
  const to = new Date(now.getTime() + 366 * 24 * 3600_000).toISOString();

  const [{ data }, { data: connectionRows }] = await Promise.all([
    supabase
      .from("scheduled_posts")
      .select(
        "id, caption, status, scheduled_for, published_at, media, target_connection_ids",
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
  ]);

  const connections = new Map(
    ((connectionRows ?? []) as {
      id: string;
      platform: keyof typeof PLATFORM_LABELS;
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

  const posts: CalendarPost[] = ((data ?? []) as unknown as Row[])
    // A post's place on the calendar is when it went out, or when it is meant
    // to. One without either is a draft with no date and belongs on /drafts.
    .map((row) => ({ row, at: row.published_at ?? row.scheduled_for }))
    .filter((entry): entry is { row: Row; at: string } => Boolean(entry.at))
    .map(({ row, at }) => {
      const targets = row.target_connection_ids
        .map((id) => connections.get(id))
        .filter(Boolean) as { platform: string; name: string }[];
      return {
        id: row.id,
        caption: row.caption,
        status: row.status,
        scheduledFor: at,
        thumbnail: row.media[0]?.url ?? null,
        platforms: [...new Set(targets.map((t) => t.platform.slice(0, 2)))],
        accounts: targets.map((t) => t.name),
      };
    });

  return (
    <Page width="max-w-[1120px]">
      <PageHeader
        title="Calendar"
        subtitle="Everything with a time on it — scheduled, published, and drafts with a date pencilled in."
        actions={
          <ButtonLink href="/dashboard/compose" tone="primary">
            + New post
          </ButtonLink>
        }
      />

      {posts.length === 0 ? (
        <EmptyState
          title="Nothing scheduled"
          action={
            <ButtonLink href="/dashboard/compose" tone="primary">
              Schedule something
            </ButtonLink>
          }
        >
          Posts you schedule appear here, alongside what has already gone out.
        </EmptyState>
      ) : (
        // The grid reads the view and date from the URL, which needs Suspense
        // in an app-router page.
        <Suspense fallback={<p className="text-sm text-faint">Loading…</p>}>
          <CalendarGrid posts={posts} today={now.toISOString()} />
        </Suspense>
      )}
    </Page>
  );
}
