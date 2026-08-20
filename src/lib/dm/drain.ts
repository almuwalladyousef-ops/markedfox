import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { processInboundEvent } from "./engine";
import {
  bumpWebhookAttempts,
  createDmEngineStore,
  createDmWorkerStore,
  listPendingWebhookEvents,
  markWebhookEvent,
} from "./store";
import { runDmWorker, type WorkerSummary } from "./worker";

// One pass of the engine: turn received webhook events into jobs, then send
// what is due. Called right after a webhook lands (so a "comment LINK" is
// answered in seconds) and from every scheduler tick (so nothing is lost if
// the webhook-time pass died — rules survive a restart mid-sequence because
// the queue is the database, not memory).

export const MAX_EVENT_ATTEMPTS = 5;

export type DrainSummary = {
  eventsProcessed: number;
  eventsIgnored: number;
  eventsFailed: number;
  rulesMatched: number;
  jobsQueued: number;
  worker: WorkerSummary;
};

export async function drainDmEngine(
  service: SupabaseClient,
  options: {
    siteUrl: string;
    eventLimit?: number;
    batch?: number;
    now?: () => Date;
    log?: Pick<Console, "error" | "warn" | "log">;
  },
): Promise<DrainSummary> {
  const log = options.log ?? console;
  const now = options.now ?? (() => new Date());
  const summary: DrainSummary = {
    eventsProcessed: 0,
    eventsIgnored: 0,
    eventsFailed: 0,
    rulesMatched: 0,
    jobsQueued: 0,
    worker: { claimed: 0, sent: 0, skipped: 0, failed: 0, retried: 0, recovered: 0 },
  };

  const engine = createDmEngineStore(service);
  const pending = await listPendingWebhookEvents(service, options.eventLimit ?? 100);
  for (const stored of pending) {
    try {
      const result = await processInboundEvent(engine, stored.event, { now, log });
      summary.rulesMatched += result.rulesMatched;
      summary.jobsQueued += result.jobsQueued;
      if (result.ignoredReason) {
        summary.eventsIgnored += 1;
        await markWebhookEvent(service, stored.id, "ignored", result.ignoredReason);
      } else {
        summary.eventsProcessed += 1;
        await markWebhookEvent(service, stored.id, "processed");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const attempts = stored.attempts + 1;
      log.error(`dm engine: event ${stored.id} failed (attempt ${attempts}) — ${message}`);
      if (attempts >= MAX_EVENT_ATTEMPTS) {
        summary.eventsFailed += 1;
        await markWebhookEvent(service, stored.id, "failed", message).catch(() => undefined);
      } else {
        await bumpWebhookAttempts(service, stored.id, attempts).catch(() => undefined);
      }
    }
  }

  summary.worker = await runDmWorker(createDmWorkerStore(service, { siteUrl: options.siteUrl }), {
    batch: options.batch,
    now,
    log,
  });
  return summary;
}
