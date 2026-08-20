import "server-only";

import { randomBytes } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getFreshConnectionTokens, markConnectionStatus } from "@/lib/connections/store";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import { PlatformApiError } from "@/lib/platforms/errors";
import { getPlatform } from "@/lib/platforms/registry";
import type { Platform } from "@/lib/platforms/types";
import { recordUsage } from "@/lib/usage/record";

import type { DmEngineStore, EngineConnection } from "./engine";
import { parseRuleRow } from "./rules";
import type { DmJobDraft, DmJobRow, DmRule, InboundEvent } from "./types";
import type { DmWorkerStore, OutboundMessage, WorkerConnection, WorkerContact } from "./worker";

// The Supabase side of the DM engine. Service-role client throughout: webhooks
// arrive with no session, and the worker runs from the scheduler. Every query
// filters explicitly by the ids the engine hands it; nothing here is reachable
// from a browser.

// ── inbound events ─────────────────────────────────────────────────────────

export type StoredWebhookEvent = { id: string; event: InboundEvent };

function serialiseEvent(event: InboundEvent): Record<string, unknown> {
  return { ...event, occurredAt: event.occurredAt.toISOString() };
}

function deserialiseEvent(payload: unknown): InboundEvent | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.occurredAt !== "string") return null;
  return { ...(p as unknown as InboundEvent), occurredAt: new Date(p.occurredAt) };
}

// Insert with ON CONFLICT DO NOTHING on (platform, external_id) and return
// only the rows that were actually new — Meta retries deliveries, and the
// second copy of an event must not be processed twice.
export async function recordWebhookEvents(
  service: SupabaseClient,
  events: InboundEvent[],
): Promise<StoredWebhookEvent[]> {
  if (events.length === 0) return [];
  const { data, error } = await service
    .from("webhook_events")
    .upsert(
      events.map((event) => ({
        platform: event.platform,
        external_id: event.externalId,
        kind: event.kind,
        platform_account_id: event.platformAccountId,
        payload: serialiseEvent(event),
      })),
      { onConflict: "platform,external_id", ignoreDuplicates: true },
    )
    .select("id, payload");
  if (error) throw error;
  return (data ?? [])
    .map((row) => ({ id: String(row.id), event: deserialiseEvent(row.payload) }))
    .filter((r): r is StoredWebhookEvent => r.event !== null);
}

export async function listPendingWebhookEvents(
  service: SupabaseClient,
  limit: number,
): Promise<(StoredWebhookEvent & { attempts: number })[]> {
  const { data, error } = await service
    .from("webhook_events")
    .select("id, payload, attempts")
    .eq("status", "received")
    .order("received_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? [])
    .map((row) => ({ id: String(row.id), attempts: Number(row.attempts ?? 0), event: deserialiseEvent(row.payload) }))
    .filter((r): r is StoredWebhookEvent & { attempts: number } => r.event !== null);
}

export async function markWebhookEvent(
  service: SupabaseClient,
  id: string,
  status: "processed" | "ignored" | "failed" | "received",
  error?: string,
): Promise<void> {
  const patch: Record<string, unknown> = { status, last_error: error ?? null };
  if (status !== "received") patch.processed_at = new Date().toISOString();
  const { error: updateError } = await service.from("webhook_events").update(patch).eq("id", id);
  if (updateError) throw updateError;
}

export async function bumpWebhookAttempts(service: SupabaseClient, id: string, attempts: number): Promise<void> {
  await service.from("webhook_events").update({ attempts }).eq("id", id);
}

// ── engine store ───────────────────────────────────────────────────────────

export function createDmEngineStore(service: SupabaseClient): DmEngineStore {
  return {
    async findConnectionsByAccount(platform: Platform, platformAccountId: string): Promise<EngineConnection[]> {
      const { data, error } = await service
        .from("connections")
        .select("id, user_id, workspace_id, status")
        .eq("platform", platform)
        .eq("platform_account_id", platformAccountId);
      if (error) throw error;
      return (data ?? []) as EngineConnection[];
    },

    async listEnabledRules(connectionId: string): Promise<DmRule[]> {
      const { data, error } = await service
        .from("dm_rules")
        .select("id, user_id, workspace_id, connection_id, name, enabled, trigger_type, keywords, target_post_ids, actions, config")
        .eq("connection_id", connectionId)
        .eq("enabled", true)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? [])
        .map((row) => parseRuleRow(row as Record<string, unknown>))
        .filter((r): r is DmRule => r !== null);
    },

    async upsertContact(input) {
      const { data, error } = await service
        .from("dm_contacts")
        .upsert(
          {
            user_id: input.userId,
            workspace_id: input.workspaceId,
            connection_id: input.connectionId,
            platform_user_id: input.platformUserId,
            ...(input.username ? { username: input.username } : {}),
            ...(input.inboundAt ? { last_inbound_at: input.inboundAt.toISOString() } : {}),
          },
          { onConflict: "connection_id,platform_user_id" },
        )
        .select("id")
        .single();
      if (error) throw error;
      return { id: String(data.id) };
    },

    async hasContactFired(ruleId: string, contactId: string): Promise<boolean> {
      const { count, error } = await service
        .from("dm_jobs")
        .select("id", { count: "exact", head: true })
        .eq("rule_id", ruleId)
        .eq("contact_id", contactId);
      if (error) throw error;
      return (count ?? 0) > 0;
    },

    async insertJobs(drafts: (DmJobDraft & { contactId: string })[]): Promise<string[]> {
      if (drafts.length === 0) return [];
      const { data, error } = await service
        .from("dm_jobs")
        .upsert(
          drafts.map((d) => ({
            user_id: d.userId,
            workspace_id: d.workspaceId,
            connection_id: d.connectionId,
            rule_id: d.ruleId,
            contact_id: d.contactId,
            kind: d.kind,
            payload: d.payload,
            dedupe_key: d.dedupeKey,
            run_at: d.runAt.toISOString(),
          })),
          { onConflict: "dedupe_key", ignoreDuplicates: true },
        )
        .select("id");
      if (error) throw error;
      return (data ?? []).map((row) => String(row.id));
    },

    async recordEvent(event) {
      const { error } = await service.from("dm_events").insert({
        user_id: event.userId,
        workspace_id: event.workspaceId,
        rule_id: event.ruleId ?? null,
        job_id: event.jobId ?? null,
        contact_id: event.contactId ?? null,
        kind: event.kind,
        metadata: event.metadata ?? {},
      });
      if (error) throw error;
    },
  };
}

// ── worker store ───────────────────────────────────────────────────────────

function toJobRow(row: Record<string, unknown>): DmJobRow {
  const payload = (typeof row.payload === "object" && row.payload !== null ? row.payload : {}) as Record<string, unknown>;
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    workspace_id: String(row.workspace_id),
    connection_id: String(row.connection_id),
    rule_id: (row.rule_id as string | null) ?? null,
    contact_id: (row.contact_id as string | null) ?? null,
    kind: row.kind as DmJobRow["kind"],
    payload: {
      text: typeof payload.text === "string" ? payload.text : "",
      buttons: Array.isArray(payload.buttons) ? (payload.buttons as DmJobRow["payload"]["buttons"]) : undefined,
      commentId: typeof payload.commentId === "string" ? payload.commentId : undefined,
      stepIndex: typeof payload.stepIndex === "number" ? payload.stepIndex : 0,
    },
    dedupe_key: String(row.dedupe_key),
    run_at: String(row.run_at),
    status: row.status as DmJobRow["status"],
    attempts: Number(row.attempts ?? 0),
    last_error: (row.last_error as string | null) ?? null,
    platform_message_id: (row.platform_message_id as string | null) ?? null,
  };
}

export function createDmWorkerStore(service: SupabaseClient, options: { siteUrl: string }): DmWorkerStore {
  return {
    async claimJobs(batch: number): Promise<DmJobRow[]> {
      const { data, error } = await service.rpc("claim_dm_jobs", { batch });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map(toJobRow);
    },

    async recoverStale(olderThan: Date): Promise<number> {
      const { data, error } = await service
        .from("dm_jobs")
        .update({ status: "pending", last_error: "worker died mid-send; requeued" })
        .eq("status", "sending")
        .lt("claimed_at", olderThan.toISOString())
        .select("id");
      if (error) throw error;
      return data?.length ?? 0;
    },

    async getConnection(connectionId: string): Promise<WorkerConnection | null> {
      const { data, error } = await service
        .from("connections")
        .select("id, platform, platform_account_id, status")
        .eq("id", connectionId)
        .maybeSingle();
      if (error) throw error;
      return (data as WorkerConnection | null) ?? null;
    },

    async getContact(contactId: string): Promise<WorkerContact | null> {
      const { data, error } = await service
        .from("dm_contacts")
        .select("id, platform_user_id, last_inbound_at")
        .eq("id", contactId)
        .maybeSingle();
      if (error) throw error;
      return (data as WorkerContact | null) ?? null;
    },

    loadSnapshot(userId: string, workspaceId: string) {
      return getEntitlementSnapshot(service, userId, workspaceId);
    },

    async createTrackedLink(input): Promise<string> {
      const token = randomBytes(9).toString("base64url");
      const { error } = await service.from("dm_links").insert({
        token,
        user_id: input.userId,
        workspace_id: input.workspaceId,
        rule_id: input.ruleId,
        job_id: input.jobId,
        contact_id: input.contactId,
        destination_url: input.destinationUrl,
      });
      if (error) throw error;
      return `${options.siteUrl.replace(/\/+$/, "")}/r/${token}`;
    },

    async send(connection: WorkerConnection, message: OutboundMessage) {
      const adapter = getPlatform(connection.platform);
      if (!adapter.messaging) {
        throw new PlatformApiError(connection.platform, "this platform has no DM automation");
      }
      const { tokens } = await getFreshConnectionTokens(service, connection.id);
      const common = { tokens, platformAccountId: connection.platform_account_id };
      switch (message.kind) {
        case "private_reply": {
          const out = await adapter.messaging.sendPrivateReply({ ...common, commentId: message.commentId!, text: message.text });
          return { platformMessageId: out.messageId };
        }
        case "message": {
          const out = await adapter.messaging.sendMessage({ ...common, recipientId: message.recipientId!, text: message.text, buttons: message.buttons });
          return { platformMessageId: out.messageId };
        }
        case "comment_reply": {
          const out = await adapter.messaging.replyToComment({ ...common, commentId: message.commentId!, text: message.text });
          return { platformMessageId: out.replyId };
        }
      }
    },

    async finishJob(jobId, patch) {
      const update: Record<string, unknown> = { status: patch.status };
      if (patch.lastError !== undefined) update.last_error = patch.lastError;
      if (patch.platformMessageId !== undefined) update.platform_message_id = patch.platformMessageId;
      if (patch.runAt) update.run_at = patch.runAt.toISOString();
      if (patch.sentAt) update.sent_at = patch.sentAt.toISOString();
      const { error } = await service.from("dm_jobs").update(update).eq("id", jobId);
      if (error) throw error;
    },

    async recordUsage(input) {
      await recordUsage(service, {
        userId: input.userId,
        workspaceId: input.workspaceId,
        kind: "dm_send",
        platform: input.platform,
        refId: input.refId,
      });
    },

    async recordEvent(event) {
      const { error } = await service.from("dm_events").insert({
        user_id: event.userId,
        workspace_id: event.workspaceId,
        rule_id: event.ruleId ?? null,
        job_id: event.jobId ?? null,
        contact_id: event.contactId ?? null,
        kind: event.kind,
        metadata: event.metadata ?? {},
      });
      if (error) throw error;
    },

    markConnectionExpired(connectionId: string) {
      return markConnectionStatus(service, connectionId, "expired");
    },

    async touchContactOutbound(contactId: string, at: Date) {
      await service.from("dm_contacts").update({ last_outbound_at: at.toISOString() }).eq("id", contactId);
    },
  };
}
