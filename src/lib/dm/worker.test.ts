import { describe, expect, it } from "vitest";

import type { EntitlementSnapshot } from "@/lib/entitlements/types";
import { PlatformApiError, PlatformAuthError } from "@/lib/platforms/errors";

import type { DmEventKind, DmJobRow } from "./types";
import {
  backoffMs,
  composeOutbound,
  runDmWorker,
  type DmWorkerStore,
  type OutboundMessage,
  type WorkerConnection,
  type WorkerContact,
} from "./worker";

const NOW = new Date("2026-08-19T12:00:00Z");

const snapshot = (over: { dmSendsThisMonth?: number; dmSendsPerMonth?: number } = {}): EntitlementSnapshot => ({
  planId: "free",
  limits: {
    postsPerDay: 2,
    maxConnectedAccountsPerWorkspace: 3,
    maxWorkspaces: 2,
    platforms: null,
    xPostsPerMonth: 0,
    xLinksAllowed: false,
    dmRulesMax: 1,
    dmSendsPerMonth: over.dmSendsPerMonth ?? 200,
    videoUploadMinutesPerMonth: 60,
    funnels: false,
    researchCreditsPerMonth: 0,
  },
  usage: {
    postsToday: 0,
    xPostsThisMonth: 0,
    dmSendsThisMonth: over.dmSendsThisMonth ?? 0,
    dmRuleCount: 1,
    videoMinutesThisMonth: 0,
    connectedAccountsInWorkspace: 1,
    workspaceCount: 1,
  },
});

const job = (over: Partial<DmJobRow> = {}): DmJobRow => ({
  id: "job-1",
  user_id: "user",
  workspace_id: "ws",
  connection_id: "conn",
  rule_id: "rule",
  contact_id: "contact",
  kind: "private_reply",
  payload: { text: "Here you go", commentId: "c1", stepIndex: 0 },
  dedupe_key: "rule:ig-comment:c1:0",
  run_at: NOW.toISOString(),
  status: "sending",
  attempts: 1,
  last_error: null,
  platform_message_id: null,
  ...over,
});

class MemoryStore implements DmWorkerStore {
  queue: DmJobRow[] = [];
  connection: WorkerConnection | null = { id: "conn", platform: "instagram", platform_account_id: "ig", status: "active" };
  contact: WorkerContact | null = { id: "contact", platform_user_id: "fan", last_inbound_at: null };
  snapshot = snapshot();
  sent: OutboundMessage[] = [];
  sendError: Error | null = null;
  finished: { id: string; patch: Record<string, unknown> }[] = [];
  usage: unknown[] = [];
  events: { kind: DmEventKind; metadata?: Record<string, unknown> }[] = [];
  expired: string[] = [];
  links: string[] = [];
  touched: string[] = [];
  stale = 0;

  async claimJobs() {
    const out = this.queue;
    this.queue = [];
    return out;
  }
  async recoverStale() {
    return this.stale;
  }
  async getConnection() {
    return this.connection;
  }
  async getContact() {
    return this.contact;
  }
  async loadSnapshot() {
    return this.snapshot;
  }
  async createTrackedLink(input: { destinationUrl: string }) {
    this.links.push(input.destinationUrl);
    return `https://markedfox.com/r/t${this.links.length}`;
  }
  async send(_c: WorkerConnection, message: OutboundMessage) {
    if (this.sendError) throw this.sendError;
    this.sent.push(message);
    return { platformMessageId: `mid-${this.sent.length}` };
  }
  async finishJob(id: string, patch: Record<string, unknown>) {
    this.finished.push({ id, patch });
  }
  async recordUsage(u: unknown) {
    this.usage.push(u);
  }
  async recordEvent(e: { kind: DmEventKind; metadata?: Record<string, unknown> }) {
    this.events.push(e);
  }
  async markConnectionExpired(id: string) {
    this.expired.push(id);
  }
  async touchContactOutbound(id: string) {
    this.touched.push(id);
  }
}

const quiet = { error: () => {}, warn: () => {} };

describe("runDmWorker", () => {
  it("sends a private reply, counts it against the plan, tracks the button link, records the event", async () => {
    const store = new MemoryStore();
    store.queue = [job({ payload: { text: "Here you go", commentId: "c1", stepIndex: 0, buttons: [{ title: "Open", url: "https://example.com/guide" }] } })];
    const summary = await runDmWorker(store, { now: () => NOW, log: quiet });
    expect(summary).toMatchObject({ claimed: 1, sent: 1, skipped: 0, failed: 0 });
    expect(store.sent[0]).toEqual({
      kind: "private_reply",
      text: "Here you go\n\nOpen: https://markedfox.com/r/t1",
      commentId: "c1",
      recipientId: "fan",
    });
    expect(store.links).toEqual(["https://example.com/guide"]);
    expect(store.usage).toHaveLength(1);
    expect(store.finished[0].patch).toMatchObject({ status: "sent", platformMessageId: "mid-1" });
    expect(store.events.map((e) => e.kind)).toEqual(["sent"]);
    expect(store.touched).toEqual(["contact"]);
  });

  it("refuses the DM that would pass the plan's monthly cap, before sending", async () => {
    const store = new MemoryStore();
    store.snapshot = snapshot({ dmSendsThisMonth: 200, dmSendsPerMonth: 200 });
    store.queue = [job()];
    const summary = await runDmWorker(store, { now: () => NOW, log: quiet });
    expect(summary.skipped).toBe(1);
    expect(store.sent).toHaveLength(0);
    expect(store.usage).toHaveLength(0);
    expect(store.finished[0].patch).toMatchObject({ status: "skipped" });
    expect(store.finished[0].patch.lastError).toMatch(/capped at 200/);
  });

  it("does not count a public comment reply against DM sends, and never gates it by the window", async () => {
    const store = new MemoryStore();
    store.snapshot = snapshot({ dmSendsThisMonth: 200 });
    store.queue = [job({ kind: "comment_reply", payload: { text: "Sent!", commentId: "c1", stepIndex: 1 } })];
    const summary = await runDmWorker(store, { now: () => NOW, log: quiet });
    expect(summary.sent).toBe(1);
    expect(store.sent[0]).toEqual({ kind: "comment_reply", text: "Sent!", commentId: "c1" });
    expect(store.usage).toHaveLength(0);
  });

  it("skips a follow-up message outside Meta's 24-hour window and sends one inside it with real buttons", async () => {
    const store = new MemoryStore();
    store.contact = { id: "contact", platform_user_id: "fan", last_inbound_at: new Date(NOW.getTime() - 25 * 3600_000).toISOString() };
    store.queue = [job({ kind: "message", payload: { text: "Still there?", stepIndex: 2 } })];
    let summary = await runDmWorker(store, { now: () => NOW, log: quiet });
    expect(summary.skipped).toBe(1);
    expect(store.finished[0].patch.lastError).toMatch(/24-hour/);
    expect(store.sent).toHaveLength(0);

    store.contact.last_inbound_at = new Date(NOW.getTime() - 3600_000).toISOString();
    store.queue = [job({ id: "job-2", kind: "message", payload: { text: "Guide", stepIndex: 0, buttons: [{ title: "Open", url: "https://example.com/g" }] } })];
    summary = await runDmWorker(store, { now: () => NOW, log: quiet });
    expect(summary.sent).toBe(1);
    expect(store.sent[0]).toEqual({
      kind: "message",
      text: "Guide",
      buttons: [{ title: "Open", url: "https://markedfox.com/r/t1" }],
      recipientId: "fan",
    });
  });

  it("marks the connection expired on a dead grant and dead-letters the job", async () => {
    const store = new MemoryStore();
    store.sendError = new PlatformAuthError("instagram", "token revoked");
    store.queue = [job()];
    const summary = await runDmWorker(store, { now: () => NOW, log: quiet });
    expect(summary.failed).toBe(1);
    expect(store.expired).toEqual(["conn"]);
    expect(store.finished[0].patch).toMatchObject({ status: "failed" });
    expect(store.events.map((e) => e.kind)).toEqual(["failed"]);
  });

  it("backs off a retryable platform error and dead-letters after the last attempt", async () => {
    const store = new MemoryStore();
    store.sendError = new PlatformApiError("instagram", "rate limited", true);
    store.queue = [job({ attempts: 1 })];
    let summary = await runDmWorker(store, { now: () => NOW, log: quiet });
    expect(summary.retried).toBe(1);
    expect(store.finished[0].patch).toMatchObject({ status: "pending" });
    expect((store.finished[0].patch.runAt as Date).getTime()).toBe(NOW.getTime() + backoffMs(1));

    store.queue = [job({ attempts: 5 })];
    summary = await runDmWorker(store, { now: () => NOW, log: quiet });
    expect(summary.failed).toBe(1);
    expect(store.finished[1].patch).toMatchObject({ status: "failed" });
  });

  it("fails a job whose connection is gone or inactive without touching the platform", async () => {
    const store = new MemoryStore();
    store.connection = { id: "conn", platform: "instagram", platform_account_id: "ig", status: "expired" };
    store.queue = [job()];
    const summary = await runDmWorker(store, { now: () => NOW, log: quiet });
    expect(summary.failed).toBe(1);
    expect(store.sent).toHaveLength(0);
  });

  it("reports recovered stale claims", async () => {
    const store = new MemoryStore();
    store.stale = 3;
    expect((await runDmWorker(store, { now: () => NOW, log: quiet })).recovered).toBe(3);
  });
});

describe("composeOutbound", () => {
  it("keeps a private reply text-only with links as lines", () => {
    const out = composeOutbound(
      job({ payload: { text: "Hi", commentId: "c", stepIndex: 0, buttons: [{ title: "A", url: "u" }, { title: "B", url: "v" }] } }),
      ["https://r/1", "https://r/2"],
      { id: "x", platform_user_id: "fan", last_inbound_at: null },
    );
    expect(out.text).toBe("Hi\n\nA: https://r/1\n\nB: https://r/2");
    expect(out.buttons).toBeUndefined();
  });

  it("backoff doubles from 30s", () => {
    expect([1, 2, 3, 4].map(backoffMs)).toEqual([30_000, 60_000, 120_000, 240_000]);
  });
});
