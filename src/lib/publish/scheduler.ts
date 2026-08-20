import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { refreshExpiringConnections } from "@/lib/connections/refresh";
import { createRefreshStore, REFRESH_WINDOW_MS } from "@/lib/connections/store";
import { drainDmEngine, type DrainSummary } from "@/lib/dm/drain";
import { purgeMedia } from "@/lib/media/purge";
import { createMediaPurgeStore, isMediaStorageConfigured } from "@/lib/media/store";
import { createBudgetStore } from "@/lib/platforms/budget-store";
import { sweepResearchSources, type SweepSummary } from "@/lib/research/sweep";

import { publishPost } from "./publish-post";
import { createPublishStore, toPostRow } from "./store";
import type { PublishReport } from "./types";

// One scheduler tick: claim every due post and publish it.
//
// Called by POST /api/internal/scheduler/tick, which the systemd timer's
// scripts/run-scheduler.mjs hits once a minute. The tick runs inside the Next
// server because that is where the TypeScript adapters are — the timer script
// is plain Node and cannot import them.
//
// Concurrency: posts are claimed with SELECT … FOR UPDATE SKIP LOCKED through
// claim_scheduled_posts(), so two workers never take the same row, and a post
// whose worker dies is recovered by the next tick's lease sweep rather than
// stranded in `publishing` forever — which is what a deploy restart or an OOM
// during a burst used to cost.

// How long one tick keeps CLAIMING new posts. A post already claimed always
// finishes (a TikTok PULL_FROM_URL poll alone can run 300s), but once this
// much of the tick is spent, the rest of the due list waits for the next
// minute's tick rather than stacking behind it — scripts/run-scheduler.mjs
// gives up listening at 280s and the systemd unit at 300s, so a tick that
// keeps claiming past that point reports as failed while still running.
export const CLAIM_BUDGET_MS = 200_000;

// How long a claimed post may stay in `publishing` before a later tick assumes
// its worker died and returns it to the queue. Generous on purpose: a single
// TikTok PULL_FROM_URL poll can legally run 300 seconds, and reclaiming a post
// that is still publishing would post it twice — worse than posting it late.
export const LEASE_SECONDS = 900;

// After this many interrupted attempts a post is dead-lettered with a message
// a human can act on, rather than retried forever.
export const MAX_PUBLISH_ATTEMPTS = 5;

export type TickSummary = {
  due: number;
  claimed: number;
  /** Due posts this tick never reached because it ran out of claiming time. */
  deferred: number;
  /** Posts held back by the shared per-app rate-limit budget and requeued.
   *  Distinct from `deferred`: these WERE claimed and tried. */
  rateLimited: number;
  /** Posts a dead worker left in `publishing`, returned to the queue. */
  recovered: number;
  /** Posts that had been interrupted too many times to keep retrying. */
  deadLettered: number;
  published: number;
  partial: number;
  failed: number;
  /** Connections whose tokens were renewed this tick. */
  refreshed: number;
  /** Renewals that failed; the connection keeps its old token and is retried. */
  refreshFailed: number;
  /** Media objects deleted now that their post is done with them. */
  purged: number;
  /** Uploads that were never attached to any post, deleted after their grace. */
  orphansPurged: number;
  /** The DM engine's pass: events matched, DMs sent, retried, failed. */
  dm: DrainSummary | null;
  research: SweepSummary | null;
  reports: PublishReport[];
};

export async function runSchedulerTick(
  supabase: SupabaseClient,
  options: {
    batchSize?: number;
    claimBudgetMs?: number;
    now?: () => Date;
    log?: Pick<Console, "error" | "warn" | "log">;
  } = {},
): Promise<TickSummary> {
  const batchSize = options.batchSize ?? 25;
  const claimBudgetMs = options.claimBudgetMs ?? CLAIM_BUDGET_MS;
  const now = options.now ?? (() => new Date());
  const log = options.log ?? console;
  const store = createPublishStore(supabase);
  const budget = createBudgetStore(supabase);
  const startedAt = now().getTime();

  const summary: TickSummary = {
    due: 0,
    claimed: 0,
    deferred: 0,
    rateLimited: 0,
    recovered: 0,
    deadLettered: 0,
    published: 0,
    partial: 0,
    failed: 0,
    refreshed: 0,
    refreshFailed: 0,
    purged: 0,
    orphansPurged: 0,
    dm: null,
    research: null,
    reports: [],
  };

  // Recover anything a previous tick left stranded in `publishing` — a deploy
  // restart or an OOM mid-publish. Runs BEFORE the claim so a recovered post
  // can go out in this same tick rather than waiting another minute. The lease
  // is generous on purpose: reclaiming a post that is still publishing would
  // post it twice, which is the one outcome worse than posting it late.
  try {
    const { data: recovery, error: recoveryError } = await supabase.rpc(
      "recover_stranded_posts",
      { p_lease_seconds: LEASE_SECONDS, p_max_attempts: MAX_PUBLISH_ATTEMPTS },
    );
    if (recoveryError) throw recoveryError;
    const row = Array.isArray(recovery) ? recovery[0] : recovery;
    summary.recovered = Number(row?.recovered ?? 0);
    summary.deadLettered = Number(row?.dead_lettered ?? 0);
    if (summary.recovered > 0 || summary.deadLettered > 0) {
      log.warn(
        `scheduler: recovered ${summary.recovered} stranded post(s), gave up on ${summary.deadLettered}`,
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`scheduler: stranded-post recovery failed — ${message}`);
  }

  const { count: dueCount, error: countError } = await supabase
    .from("scheduled_posts")
    .select("id", { count: "exact", head: true })
    .eq("status", "scheduled")
    .lte("scheduled_for", now().toISOString());
  if (countError) throw countError;
  summary.due = dueCount ?? 0;

  // Claim with FOR UPDATE SKIP LOCKED rather than a conditional update: two
  // workers (this tick and a future webhook-time drain) can run at once and
  // will never take the same post.
  let claimedTotal = 0;
  while (claimedTotal < summary.due) {
    if (now().getTime() - startedAt > claimBudgetMs) break;

    const remaining = Math.min(batchSize, summary.due - claimedTotal);
    const { data: batch, error: claimError } = await supabase.rpc(
      "claim_scheduled_posts",
      { batch: remaining },
    );
    if (claimError) {
      log.error(`scheduler: claim failed — ${claimError.message}`);
      break;
    }

    const rows = (batch ?? []) as Record<string, unknown>[];
    if (rows.length === 0) break;

    for (const raw of rows) {
      claimedTotal += 1;
      summary.claimed += 1;
      const post = toPostRow(raw);

      try {
        const report = await publishPost({ store, budget, now, log }, post);
        summary.reports.push(report);
        // `deferred` here means "the shared budget said not yet, and the post
        // is back in the queue" — not the same thing as the tick's own
        // claiming budget running out, which is counted separately below.
        if (report.status === "deferred") summary.rateLimited += 1;
        else summary[report.status] += 1;
      } catch (err) {
        // publishPost records its own per-target failures; reaching here means
        // something before or after that blew up (a store call threw). Leave a
        // trace on the row so it is not stranded in `publishing` silently.
        const message = err instanceof Error ? err.message : String(err);
        log.error(`scheduler: publish crashed for ${post.id} — ${message}`);
        await supabase
          .from("scheduled_posts")
          .update({
            status: "failed",
            claimed_at: null,
            last_error: `scheduler: ${message}`.slice(0, 1000),
          })
          .eq("id", post.id)
          .eq("status", "publishing");
        summary.failed += 1;
      }
    }
  }

  // Anything still due that this tick did not reach waits for the next minute.
  summary.deferred = Math.max(0, summary.due - claimedTotal);

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

  // The DM engine: any webhook events the webhook-time pass did not finish
  // (a restart mid-drain), plus every DM now due — follow-ups with delays,
  // retries backing off. Isolated like the others: its failure is logged.
  try {
    summary.dm = await drainDmEngine(supabase, {
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "https://markedfox.com",
      now,
      log,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`scheduler: dm engine drain failed — ${message}`);
  }

  // Research: refresh a few watched channels whose numbers are a day stale.
  // Deliberately a small batch per tick — every platform meters these reads
  // (YouTube by quota, X by the dollar), and the tick runs every minute, so a
  // batch of three still covers thousands of refreshes a day.
  try {
    summary.research = await sweepResearchSources({ now: now() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`scheduler: research sweep failed — ${message}`);
  }

  // Storage cleanup. Media exists only so the platforms can fetch it once; a
  // post that is done with it is holding bytes against a 10GB free tier. Last
  // in the tick because it is the least urgent thing here, and — like the
  // refresh sweep — its failures are counted rather than thrown.
  if (isMediaStorageConfigured()) {
    try {
      const purge = await purgeMedia(createMediaPurgeStore(supabase), {
        publicBaseUrl: process.env.R2_PUBLIC_BASE_URL ?? "",
        now,
        log,
      });
      summary.purged = purge.objectsDeleted;
      summary.orphansPurged = purge.orphansDeleted;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`scheduler: media purge failed — ${message}`);
    }
  }

  return summary;
}
