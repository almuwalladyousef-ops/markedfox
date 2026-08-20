import { describe, expect, it } from "vitest";

import { processInboundEvent, type DmEngineStore, type EngineConnection } from "./engine";
import type { DmEventKind, DmJobDraft, DmRule, InboundEvent } from "./types";

// The Phase 4 exit criteria, as tests: two users' rules run without
// cross-talk, a comment on A's post never triggers B's rule, duplicate
// deliveries are dropped, one answer per person per rule.

const NOW = new Date("2026-08-19T12:00:00Z");

class MemoryStore implements DmEngineStore {
  connections: EngineConnection[] = [];
  /** account id → connections */
  accounts = new Map<string, string[]>();
  rules: DmRule[] = [];
  contacts = new Map<string, { id: string; userId: string }>();
  jobs = new Map<string, DmJobDraft & { contactId: string }>();
  events: { kind: DmEventKind; ruleId?: string; userId: string; metadata?: Record<string, unknown> }[] = [];
  fired = new Set<string>();

  async findConnectionsByAccount(_platform: string, accountId: string) {
    const ids = this.accounts.get(accountId) ?? [];
    return this.connections.filter((c) => ids.includes(c.id));
  }
  async listEnabledRules(connectionId: string) {
    return this.rules.filter((r) => r.connection_id === connectionId && r.enabled);
  }
  async upsertContact(input: { userId: string; connectionId: string; platformUserId: string; inboundAt?: Date }) {
    const key = `${input.connectionId}:${input.platformUserId}`;
    const existing = this.contacts.get(key);
    if (existing) return existing;
    const created = { id: `contact-${this.contacts.size + 1}`, userId: input.userId };
    this.contacts.set(key, created);
    return created;
  }
  async hasContactFired(ruleId: string, contactId: string) {
    return this.fired.has(`${ruleId}:${contactId}`);
  }
  async insertJobs(drafts: (DmJobDraft & { contactId: string })[]) {
    const inserted: string[] = [];
    for (const d of drafts) {
      if (this.jobs.has(d.dedupeKey)) continue; // unique (dedupe_key)
      this.jobs.set(d.dedupeKey, d);
      this.fired.add(`${d.ruleId}:${d.contactId}`);
      inserted.push(d.dedupeKey);
    }
    return inserted;
  }
  async recordEvent(e: { kind: DmEventKind; ruleId?: string; userId: string; metadata?: Record<string, unknown> }) {
    this.events.push(e);
  }
}

const rule = (over: Partial<DmRule>): DmRule => ({
  id: "rule",
  user_id: "user",
  workspace_id: "ws",
  connection_id: "conn",
  name: "r",
  enabled: true,
  trigger_type: "comment",
  keywords: ["link"],
  target_post_ids: [],
  actions: [{ type: "private_reply", text: "here" }],
  config: {},
  ...over,
});

const comment = (over: Partial<Extract<InboundEvent, { kind: "comment" }>> = {}): InboundEvent => ({
  kind: "comment",
  platform: "instagram",
  externalId: "ig-comment:c1",
  platformAccountId: "ig-A",
  from: { id: "fan-1", username: "fan" },
  text: "LINK",
  mediaId: "m1",
  occurredAt: NOW,
  ...over,
});

function twoTenants() {
  const store = new MemoryStore();
  store.connections = [
    { id: "conn-A", user_id: "user-A", workspace_id: "ws-A", status: "active" },
    { id: "conn-B", user_id: "user-B", workspace_id: "ws-B", status: "active" },
  ];
  store.accounts.set("ig-A", ["conn-A"]);
  store.accounts.set("ig-B", ["conn-B"]);
  store.rules = [
    rule({ id: "rule-A", user_id: "user-A", workspace_id: "ws-A", connection_id: "conn-A" }),
    rule({ id: "rule-B", user_id: "user-B", workspace_id: "ws-B", connection_id: "conn-B", keywords: [] }),
  ];
  return store;
}

describe("processInboundEvent", () => {
  it("a comment on A's post fires only A's rule — never B's, even when B's rule matches everything", async () => {
    const store = twoTenants();
    const result = await processInboundEvent(store, comment({ platformAccountId: "ig-A" }), { now: () => NOW });
    expect(result).toEqual({ connections: 1, rulesMatched: 1, jobsQueued: 1, ignoredReason: null });
    const jobs = Array.from(store.jobs.values());
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ ruleId: "rule-A", userId: "user-A", workspaceId: "ws-A", connectionId: "conn-A" });
    expect(store.events.map((e) => [e.kind, e.userId])).toEqual([["triggered", "user-A"]]);
  });

  it("two tenants' events in a row each land on their own rules", async () => {
    const store = twoTenants();
    await processInboundEvent(store, comment({ platformAccountId: "ig-A", externalId: "ig-comment:a1" }), { now: () => NOW });
    await processInboundEvent(store, comment({ platformAccountId: "ig-B", externalId: "ig-comment:b1", from: { id: "fan-9" } }), { now: () => NOW });
    const byRule = Array.from(store.jobs.values()).map((j) => j.ruleId).sort();
    expect(byRule).toEqual(["rule-A", "rule-B"]);
  });

  it("drops a replayed delivery: same event id plans the same dedupe keys, nothing new is inserted", async () => {
    const store = twoTenants();
    const first = await processInboundEvent(store, comment(), { now: () => NOW });
    const again = await processInboundEvent(store, comment(), { now: () => new Date(NOW.getTime() + 60_000) });
    expect(first.jobsQueued).toBe(1);
    expect(again.jobsQueued).toBe(0);
    expect(store.jobs.size).toBe(1);
  });

  it("answers a person once per comment rule: a second LINK comment is skipped, not re-sent", async () => {
    const store = twoTenants();
    await processInboundEvent(store, comment({ externalId: "ig-comment:c1" }), { now: () => NOW });
    const second = await processInboundEvent(store, comment({ externalId: "ig-comment:c2" }), { now: () => NOW });
    expect(second.rulesMatched).toBe(1);
    expect(second.jobsQueued).toBe(0);
    expect(store.events.map((e) => e.kind)).toEqual(["triggered", "skipped"]);
    // …unless the rule opts out.
    store.rules[0].config.once_per_contact = false;
    const third = await processInboundEvent(store, comment({ externalId: "ig-comment:c3" }), { now: () => NOW });
    expect(third.jobsQueued).toBe(1);
  });

  it("ignores events for accounts nobody has connected, and inactive connections", async () => {
    const store = twoTenants();
    expect((await processInboundEvent(store, comment({ platformAccountId: "ig-nobody" }))).ignoredReason).toBe("no_connection");
    store.connections[0].status = "expired";
    expect((await processInboundEvent(store, comment({ platformAccountId: "ig-A" }))).ignoredReason).toBe("no_connection");
    expect(store.jobs.size).toBe(0);
  });

  it("records a tap for a postback and fires no rule; never creates a contact for the account's own echo", async () => {
    const store = twoTenants();
    await processInboundEvent(store, {
      kind: "postback",
      platform: "instagram",
      externalId: "ig-postback:p1",
      platformAccountId: "ig-A",
      from: { id: "fan-1" },
      payload: "x",
      occurredAt: NOW,
    });
    expect(store.events.map((e) => e.kind)).toEqual(["tapped"]);
    expect(store.jobs.size).toBe(0);

    await processInboundEvent(store, {
      kind: "message",
      platform: "instagram",
      externalId: "ig-message:echo",
      platformAccountId: "ig-A",
      from: { id: "fan-2" },
      text: "link",
      storyReply: false,
      echo: true,
      occurredAt: NOW,
    });
    expect(store.contacts.has("conn-A:fan-2")).toBe(false);
    expect(store.jobs.size).toBe(0);
  });

  it("opens the messaging window only for messages, not comments", async () => {
    const store = twoTenants();
    const seen: { inboundAt?: Date }[] = [];
    const original = store.upsertContact.bind(store);
    store.upsertContact = async (input) => {
      seen.push({ inboundAt: input.inboundAt });
      return original(input);
    };
    await processInboundEvent(store, comment(), { now: () => NOW });
    await processInboundEvent(store, {
      kind: "message",
      platform: "instagram",
      externalId: "ig-message:m1",
      platformAccountId: "ig-A",
      from: { id: "fan-1" },
      text: "hi",
      storyReply: false,
      echo: false,
      occurredAt: NOW,
    });
    expect(seen).toEqual([{ inboundAt: undefined }, { inboundAt: NOW }]);
  });
});
