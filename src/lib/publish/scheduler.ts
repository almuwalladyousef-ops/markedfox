import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { refreshExpiringConnections } from "@/lib/connections/refresh";
import { createRefreshStore, REFRESH_WINDOW_MS } from "@/lib/connections/store";

import { publishPost } from "./publish-post";
import { createPublishStore, POST_COLUMNS, toPostRow } from "./store";
import type { PublishReport } from "./types";

// One scheduler tick: claim every due post and publish it.
//
// Called by POST /api/internal/scheduler/tick, which the systemd timer's
// scripts/run-scheduler.mjs hits once a minute. The tick runs inside the Next
// server because that is where the TypeScript adapters are — the timer script
// is plain Node and cannot import them.
//
// Concurrency: the claim is a conditional update (`status = 'scheduled'` →
// `publishing`), so a row moved by anyone else matches zero rows and is
// skipped. With one box and a oneshot timer that will not overlap itself, that
// is enough; Phase 6 replaces the poll with SELECT … FOR UPDATE SKIP LOCKED
// and adds stale-claim recovery for a tick that dies mid-publish.

export type TickSummary = {
  due: number;
  claimed: number;
  published: number;
  partial: number;
  failed: number;
  /** Connections whose tokens were renewed this tick. */
  refreshed: number;
  /** Renewals that failed; the connection keeps its old token and is retried. */
  refreshFailed: number;
  reports: PublishReport[];
};

export async function runSchedulerTick(
  supabase: SupabaseClient,
  options: { batchSize?: number; now?: () => Date; log?: Pick<Console, "error" | "warn" | "log"> } = {},
): Promise<TickSummary> {
  const batchSize = options.batchSize ?? 25;
  const now = options.now ?? (() => new Date());
  const log = options.log ?? console;
  const store = createPublishStore(supabase);

  const summary: TickSummary = {
    due: 0,
    claimed: 0,
    published: 0,
    partial: 0,
    failed: 0,
    refreshed: 0,
    refreshFailed: 0,
    reports: [],
  };

  const { data: due, error } = await supabase
    .from("scheduled_posts")
    .select(POST_COLUMNS)
    .eq("status", "scheduled")
    .lte("scheduled_for", now().toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(batchSize);
  if (error) throw error;

  summary.due = due?.length ?? 0;

  for (const raw of due ?? []) {
    const post = toPostRow(raw as unknown as Record<string, unknown>);

    const { data: claimed, error: claimError } = await supabase
      .from("scheduled_posts")
      .update({ status: "publishing", attempt_count: post.attempt_count + 1 })
      .eq("id", post.id)
      .eq("status", "scheduled")
      .select("id")
      .maybeSingle();
    if (claimError) {
      log.error(`scheduler: claim failed for ${post.id} — ${claimError.message}`);
      continue;
    }
    if (!claimed) continue;
    summary.claimed += 1;

    try {
      const report = await publishPost(
        { store, now, log },
        { ...post, status: "publishing", attempt_count: post.attempt_count + 1 },
      );
      summary.reports.push(report);
      summary[report.status] += 1;
    } catch (err) {
      // publishPost records its own per-target failures; reaching here means
      // something before or after that blew up (a store call threw). Leave a
      // trace on the row so it is not stranded in `publishing` silently.
      const message = err instanceof Error ? err.message : String(err);
      log.error(`scheduler: publish crashed for ${post.id} — ${message}`);
      await supabase
        .from("scheduled_posts")
        .update({ status: "failed", last_error: `scheduler: ${message}`.slice(0, 1000) })
        .eq("id", post.id)
        .eq("status", "publishing");
      summary.failed += 1;
    }
  }

  // Token renewal, after publishing so a slow token endpoint never delays a
  // post that is already due. Its query is indexed and returns nothing on
  // almost every tick (connections_expiring_idx), and a renewal buys another
  // ~60 days, so a given connection reappears here twice a year at most.
  //
  // Failures are counted, never thrown: a dead grant on one account must not
  // take down the tick that publishes everyone else's posts.
  try {
    const refresh = await refreshExpiringConnections(
      createRefreshStore(supabase),
      { windowMs: REFRESH_WINDOW_MS, now, log },
    );
    summary.refreshed = refresh.refreshed;
    summary.refreshFailed = refresh.failed;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`scheduler: refresh sweep failed — ${message}`);
  }

  return summary;
}
