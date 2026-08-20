import type { Platform } from "@/lib/platforms/types";

import { extractEmail } from "./email";
import { planJobs, ruleMatches } from "./match";
import type { DmEventKind, DmJobDraft, DmRule, InboundEvent } from "./types";

// From one inbound event to queued sends. Pure orchestration over an
// injected store, like publishPost: the real store is Supabase with the
// service-role client (webhooks carry no session), tests use memory.
//
// Fan-out: the event names the platform account it happened on; the store
// returns every connection for that account — normally one, occasionally
// the same Instagram account connected in two of the same user's workspaces
// — and each connection's own rules are judged. No rule from any other
// connection is ever loaded, which is the whole tenant-isolation story here.

export type EngineConnection = {
  id: string;
  user_id: string;
  workspace_id: string;
  status: "active" | "expired" | "revoked" | "error";
};

export interface DmEngineStore {
  findConnectionsByAccount(platform: Platform, platformAccountId: string): Promise<EngineConnection[]>;
  listEnabledRules(connectionId: string): Promise<DmRule[]>;
  upsertContact(input: {
    userId: string;
    workspaceId: string;
    connectionId: string;
    platformUserId: string;
    username?: string;
    /** Set when the person messaged the account — opens the 24h window. */
    inboundAt?: Date;
  }): Promise<{ id: string; awaitingEmailRuleId: string | null }>;
  /** Store a captured address and clear the awaiting flag. */
  saveContactEmail(contactId: string, email: string): Promise<void>;
  /** Give up waiting: their reply was not an address. */
  clearAwaitingEmail(contactId: string): Promise<void>;
  /** Has this rule already produced a send for this contact? */
  hasContactFired(ruleId: string, contactId: string): Promise<boolean>;
  /** Insert drafts; duplicates on dedupe_key are dropped. Returns inserted ids. */
  insertJobs(drafts: (DmJobDraft & { contactId: string })[]): Promise<string[]>;
  recordEvent(event: {
    userId: string;
    workspaceId: string;
    ruleId?: string;
    jobId?: string;
    contactId?: string;
    kind: DmEventKind;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

export type EngineResult = {
  connections: number;
  rulesMatched: number;
  jobsQueued: number;
  /** "no_connection" when nobody has this account connected; otherwise null. */
  ignoredReason: string | null;
};

export async function processInboundEvent(
  store: DmEngineStore,
  event: InboundEvent,
  options: { now?: () => Date; log?: Pick<Console, "error" | "warn"> } = {},
): Promise<EngineResult> {
  const now = options.now ?? (() => new Date());
  const result: EngineResult = { connections: 0, rulesMatched: 0, jobsQueued: 0, ignoredReason: null };

  const connections = (await store.findConnectionsByAccount(event.platform, event.platformAccountId)).filter(
    (c) => c.status === "active",
  );
  if (connections.length === 0) {
    result.ignoredReason = "no_connection";
    return result;
  }
  result.connections = connections.length;

  // The account's own activity (echoes of our sends, the owner commenting on
  // their own post) never opens a window or fires a rule.
  const isOwn = event.from.id === event.platformAccountId || (event.kind === "message" && event.echo);

  for (const connection of connections) {
    const contact = isOwn
      ? null
      : await store.upsertContact({
          userId: connection.user_id,
          workspaceId: connection.workspace_id,
          connectionId: connection.id,
          platformUserId: event.from.id,
          username: event.from.username,
          inboundAt: event.kind === "message" ? event.occurredAt : undefined,
        });

    if (event.kind === "postback") {
      // A button tap on something we sent: analytics only, no rule fires.
      if (contact) {
        await store.recordEvent({
          userId: connection.user_id,
          workspaceId: connection.workspace_id,
          contactId: contact.id,
          kind: "tapped",
          metadata: { payload: event.payload, title: event.title },
        });
      }
      continue;
    }
    if (isOwn || !contact) continue;

    // A message from somebody a rule has just asked for their email is an
    // ANSWER, not a trigger. Letting it fall through to the matcher would fire
    // whichever keyword rule happens to match the address, which is both wrong
    // and, from the person's chair, unhinged.
    if (contact.awaitingEmailRuleId && event.kind === "message") {
      const email = extractEmail(event.text);
      if (email) {
        await store.saveContactEmail(contact.id, email);
        await store.recordEvent({
          userId: connection.user_id,
          workspaceId: connection.workspace_id,
          ruleId: contact.awaitingEmailRuleId,
          contactId: contact.id,
          kind: "email_captured",
        });
      } else {
        // One attempt only. Somebody who answered with something else has
        // moved on, and staying in "awaiting" would swallow every message they
        // send afterwards.
        await store.clearAwaitingEmail(contact.id);
      }
      continue;
    }

    const rules = await store.listEnabledRules(connection.id);
    for (const rule of rules) {
      if (!ruleMatches(rule, event)) continue;
      result.rulesMatched += 1;

      // Comment rules answer a person once by default — the second "LINK"
      // comment on the same post must not send the link again.
      const oncePerContact = rule.config.once_per_contact ?? rule.trigger_type === "comment";
      if (oncePerContact && (await store.hasContactFired(rule.id, contact.id))) {
        await store.recordEvent({
          userId: rule.user_id,
          workspaceId: rule.workspace_id,
          ruleId: rule.id,
          contactId: contact.id,
          kind: "skipped",
          metadata: { reason: "once_per_contact", event: event.externalId },
        });
        continue;
      }

      const drafts = planJobs(rule, event, now()).map((d) => ({ ...d, contactId: contact.id }));
      const inserted = await store.insertJobs(drafts);
      result.jobsQueued += inserted.length;
      if (inserted.length > 0) {
        await store.recordEvent({
          userId: rule.user_id,
          workspaceId: rule.workspace_id,
          ruleId: rule.id,
          contactId: contact.id,
          kind: "triggered",
          metadata: { event: event.externalId, kind: event.kind, jobs: inserted.length },
        });
      }
    }
  }
  return result;
}
