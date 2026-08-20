import { canUserDo } from "@/lib/entitlements/can-user-do";
import type { EntitlementSnapshot } from "@/lib/entitlements/types";
import { PlatformApiError, PlatformAuthError } from "@/lib/platforms/errors";
import type { Platform } from "@/lib/platforms/types";

import type { DmButton, DmEventKind, DmJobRow } from "./types";

// Delivering queued DMs. Pure orchestration over an injected store; the
// real store wraps the platform adapter's messaging capability.
//
// Per job, in order: the connection must be active; a `message` needs the
// person to have written to the account inside Meta's 24-hour window; DMs
// (not public comment replies) are counted against the plan's pooled
// monthly cap BEFORE sending; buttons become tracked links; then the send,
// the usage row, the analytics event. Failures: a dead grant marks the
// connection expired; a retryable platform error backs off (30s, 60s, 2m,
// 4m, 8m) and then dead-letters; anything else dead-letters at once.

export const MESSAGING_WINDOW_MS = 24 * 60 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const STALE_CLAIM_MS = 10 * 60 * 1000;

export type WorkerConnection = {
  id: string;
  platform: Platform;
  platform_account_id: string;
  status: "active" | "expired" | "revoked" | "error";
};

export type WorkerContact = {
  id: string;
  platform_user_id: string;
  last_inbound_at: string | null;
};

export type OutboundMessage = {
  kind: "private_reply" | "message" | "comment_reply";
  text: string;
  /** Only for `message`: buttons rendered by the platform with tracked URLs. */
  buttons?: DmButton[];
  commentId?: string;
  recipientId?: string;
};

export interface DmWorkerStore {
  claimJobs(batch: number): Promise<DmJobRow[]>;
  /** Jobs stuck in `sending` since before `olderThan` go back to `pending`. */
  recoverStale(olderThan: Date): Promise<number>;
  getConnection(connectionId: string): Promise<WorkerConnection | null>;
  getContact(contactId: string): Promise<WorkerContact | null>;
  loadSnapshot(userId: string, workspaceId: string): Promise<EntitlementSnapshot>;
  /** Mint a tracked redirect for this job's button; returns the public URL. */
  createTrackedLink(input: {
    userId: string;
    workspaceId: string;
    ruleId: string | null;
    jobId: string;
    contactId: string | null;
    destinationUrl: string;
  }): Promise<string>;
  send(connection: WorkerConnection, message: OutboundMessage): Promise<{ platformMessageId?: string }>;
  finishJob(
    jobId: string,
    patch: {
      status: DmJobRow["status"];
      lastError?: string | null;
      platformMessageId?: string | null;
      runAt?: Date;
      sentAt?: Date;
    },
  ): Promise<void>;
  recordUsage(input: { userId: string; workspaceId: string; platform: Platform; refId: string }): Promise<void>;
  recordEvent(event: {
    userId: string;
    workspaceId: string;
    ruleId?: string | null;
    jobId?: string;
    contactId?: string | null;
    kind: DmEventKind;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
  markConnectionExpired(connectionId: string): Promise<void>;
  touchContactOutbound(contactId: string, at: Date): Promise<void>;
}

export type WorkerSummary = {
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
  retried: number;
  recovered: number;
};

// Private replies are text-only on Instagram, so a button becomes a line of
// text under the message; ordinary messages carry real buttons.
export function composeOutbound(
  job: DmJobRow,
  trackedUrls: string[],
  contact: WorkerContact | null,
): OutboundMessage {
  const buttons = (job.payload.buttons ?? []).map((b, i) => ({ title: b.title, url: trackedUrls[i] ?? b.url }));
  if (job.kind === "private_reply") {
    const lines = buttons.map((b) => `${b.title}: ${b.url}`);
    return {
      kind: "private_reply",
      text: [job.payload.text, ...lines].join("\n\n"),
      commentId: job.payload.commentId,
      recipientId: contact?.platform_user_id,
    };
  }
  if (job.kind === "comment_reply") {
    return { kind: "comment_reply", text: job.payload.text, commentId: job.payload.commentId };
  }
  return {
    kind: "message",
    text: job.payload.text,
    buttons: buttons.length > 0 ? buttons : undefined,
    recipientId: contact?.platform_user_id,
  };
}

export function backoffMs(attempts: number): number {
  return 30_000 * 2 ** Math.max(0, attempts - 1);
}

export async function runDmWorker(
  store: DmWorkerStore,
  options: { batch?: number; now?: () => Date; log?: Pick<Console, "error" | "warn"> } = {},
): Promise<WorkerSummary> {
  const now = options.now ?? (() => new Date());
  const log = options.log ?? console;
  const summary: WorkerSummary = { claimed: 0, sent: 0, skipped: 0, failed: 0, retried: 0, recovered: 0 };

  summary.recovered = await store.recoverStale(new Date(now().getTime() - STALE_CLAIM_MS));

  const jobs = await store.claimJobs(options.batch ?? 20);
  summary.claimed = jobs.length;

  for (const job of jobs) {
    const base = { userId: job.user_id, workspaceId: job.workspace_id, ruleId: job.rule_id, jobId: job.id, contactId: job.contact_id };
    const fail = async (reason: string, status: "failed" | "skipped" = "failed") => {
      await store.finishJob(job.id, { status, lastError: reason });
      await store.recordEvent({ ...base, kind: status, metadata: { reason } });
      summary[status] += 1;
    };

    try {
      const connection = await store.getConnection(job.connection_id);
      if (!connection || connection.status !== "active") {
        await fail(connection ? `connection ${connection.status}` : "connection missing");
        continue;
      }
      const contact = job.contact_id ? await store.getContact(job.contact_id) : null;

      if (job.kind === "message") {
        if (!contact?.platform_user_id) {
          await fail("no recipient for this message");
          continue;
        }
        const lastInbound = contact.last_inbound_at ? new Date(contact.last_inbound_at).getTime() : null;
        if (lastInbound === null || now().getTime() - lastInbound > MESSAGING_WINDOW_MS) {
          // Meta's rule, not ours: a DM may only follow a message from the
          // person within 24 hours. Skipped, not failed — nothing is wrong.
          await fail("outside the 24-hour messaging window", "skipped");
          continue;
        }
      }
      if ((job.kind === "private_reply" || job.kind === "comment_reply") && !job.payload.commentId) {
        await fail("no comment to answer");
        continue;
      }

      // The plan's pooled DM cap, checked before the send so the 201st DM on
      // Free never goes out. Public comment replies are not DMs.
      const isDm = job.kind !== "comment_reply";
      if (isDm) {
        const snapshot = await store.loadSnapshot(job.user_id, job.workspace_id);
        const decision = canUserDo(snapshot, { type: "send_dm" });
        if (!decision.allowed) {
          await fail(decision.reason, "skipped");
          continue;
        }
      }

      const tracked: string[] = [];
      for (const button of job.payload.buttons ?? []) {
        tracked.push(
          await store.createTrackedLink({
            userId: job.user_id,
            workspaceId: job.workspace_id,
            ruleId: job.rule_id,
            jobId: job.id,
            contactId: job.contact_id,
            destinationUrl: button.url,
          }),
        );
      }

      const message = composeOutbound(job, tracked, contact);
      const result = await store.send(connection, message);

      const at = now();
      await store.finishJob(job.id, { status: "sent", platformMessageId: result.platformMessageId ?? null, sentAt: at, lastError: null });
      if (isDm) {
        await store.recordUsage({ userId: job.user_id, workspaceId: job.workspace_id, platform: connection.platform, refId: job.rule_id ?? job.id });
        if (contact) await store.touchContactOutbound(contact.id, at);
      }
      await store.recordEvent({ ...base, kind: "sent", metadata: { kind: job.kind, step: job.payload.stepIndex } });
      summary.sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (error instanceof PlatformAuthError) {
        await store.markConnectionExpired(job.connection_id).catch((e) => log.error("dm worker: could not mark connection expired", e));
        await fail(`reconnect needed: ${message}`);
        continue;
      }
      const retryable = error instanceof PlatformApiError ? error.retryable : false;
      if (retryable && job.attempts < MAX_ATTEMPTS) {
        await store.finishJob(job.id, { status: "pending", lastError: message, runAt: new Date(now().getTime() + backoffMs(job.attempts)) });
        summary.retried += 1;
        continue;
      }
      await fail(message);
    }
  }
  return summary;
}
