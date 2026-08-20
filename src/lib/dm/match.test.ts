import { describe, expect, it } from "vitest";

import { matchesKeywords, planJobs, ruleMatches } from "./match";
import type { DmRule, InboundEvent } from "./types";

const NOW = new Date("2026-08-19T12:00:00Z");

const rule = (over: Partial<DmRule> = {}): DmRule => ({
  id: "rule-1",
  user_id: "user-a",
  workspace_id: "ws-a",
  connection_id: "conn-a",
  name: "Link on LINK",
  enabled: true,
  trigger_type: "comment",
  keywords: ["link"],
  target_post_ids: [],
  actions: [
    { type: "private_reply", text: "Here it is", buttons: [{ title: "Open", url: "https://example.com/x" }] },
    { type: "comment_reply", text: "Sent you a DM!" },
    { type: "message", text: "Still there?", delay_seconds: 3600 },
  ],
  config: {},
  ...over,
});

const comment = (over: Partial<Extract<InboundEvent, { kind: "comment" }>> = {}): InboundEvent => ({
  kind: "comment",
  platform: "instagram",
  externalId: "ig-comment:c1",
  platformAccountId: "acct-a",
  from: { id: "fan-1", username: "fan" },
  text: "LINK please!",
  mediaId: "media-1",
  occurredAt: NOW,
  ...over,
});

const message = (over: Partial<Extract<InboundEvent, { kind: "message" }>> = {}): InboundEvent => ({
  kind: "message",
  platform: "instagram",
  externalId: "ig-message:m1",
  platformAccountId: "acct-a",
  from: { id: "fan-1" },
  text: "hello",
  storyReply: false,
  echo: false,
  occurredAt: NOW,
  ...over,
});

describe("matchesKeywords", () => {
  it("is case- and whitespace-insensitive, contains by default, exact on request", () => {
    expect(matchesKeywords("Send me the LINK pls", ["link"])).toBe(true);
    expect(matchesKeywords("linkedin", ["link"])).toBe(true); // contains
    expect(matchesKeywords("linkedin", ["link"], "exact")).toBe(false);
    expect(matchesKeywords("  Link  ", ["link"], "exact")).toBe(true);
    expect(matchesKeywords("anything", [])).toBe(true); // no keywords = any text
    expect(matchesKeywords("", ["link"])).toBe(false);
  });
});

describe("ruleMatches", () => {
  it("fires a comment rule on a matching comment on any post", () => {
    expect(ruleMatches(rule(), comment())).toBe(true);
  });

  it("respects per-post targeting", () => {
    expect(ruleMatches(rule({ target_post_ids: ["media-2"] }), comment())).toBe(false);
    expect(ruleMatches(rule({ target_post_ids: ["media-1", "media-2"] }), comment())).toBe(true);
    expect(ruleMatches(rule({ target_post_ids: ["media-1"] }), comment({ mediaId: undefined }))).toBe(false);
  });

  it("never fires on the account's own comment, a reply in a thread, a disabled rule, or an empty rule", () => {
    expect(ruleMatches(rule(), comment({ from: { id: "acct-a" } }))).toBe(false);
    expect(ruleMatches(rule(), comment({ parentCommentId: "c0" }))).toBe(false);
    expect(ruleMatches(rule({ enabled: false }), comment())).toBe(false);
    expect(ruleMatches(rule({ actions: [] }), comment())).toBe(false);
  });

  it("keeps trigger types apart: a comment rule ignores DMs and vice versa", () => {
    expect(ruleMatches(rule(), message({ text: "link" }))).toBe(false);
    expect(ruleMatches(rule({ trigger_type: "dm_keyword" }), comment())).toBe(false);
    expect(ruleMatches(rule({ trigger_type: "dm_keyword" }), message({ text: "the link" }))).toBe(true);
  });

  it("ignores echoes and lets story_reply rules see only story replies", () => {
    expect(ruleMatches(rule({ trigger_type: "dm_keyword" }), message({ text: "link", echo: true }))).toBe(false);
    expect(ruleMatches(rule({ trigger_type: "story_reply", keywords: [] }), message({ storyReply: true }))).toBe(true);
    expect(ruleMatches(rule({ trigger_type: "story_reply", keywords: [] }), message())).toBe(false);
    // A story reply is also a DM, so a dm_keyword rule may answer it too.
    expect(ruleMatches(rule({ trigger_type: "dm_keyword" }), message({ text: "link", storyReply: true }))).toBe(true);
  });

  it("never fires on postbacks", () => {
    expect(
      ruleMatches(rule({ trigger_type: "dm_keyword", keywords: [] }), {
        kind: "postback",
        platform: "instagram",
        externalId: "ig-postback:p",
        platformAccountId: "acct-a",
        from: { id: "fan-1" },
        payload: "x",
        occurredAt: NOW,
      }),
    ).toBe(false);
  });
});

describe("planJobs", () => {
  it("plans one job per step with stable dedupe keys and delays", () => {
    const jobs = planJobs(rule(), comment(), NOW);
    expect(jobs.map((j) => [j.kind, j.dedupeKey, j.runAt.toISOString()])).toEqual([
      ["private_reply", "rule-1:ig-comment:c1:0", NOW.toISOString()],
      ["comment_reply", "rule-1:ig-comment:c1:1", NOW.toISOString()],
      ["message", "rule-1:ig-comment:c1:2", new Date(NOW.getTime() + 3600_000).toISOString()],
    ]);
    expect(jobs[0].payload).toEqual({
      text: "Here it is",
      buttons: [{ title: "Open", url: "https://example.com/x" }],
      commentId: "c1",
      stepIndex: 0,
    });
    expect(jobs[1].payload.commentId).toBe("c1");
    expect(jobs.every((j) => j.contactPlatformUserId === "fan-1")).toBe(true);
  });

  it("replans identical keys for a replayed event, so the queue's unique key drops them", () => {
    const a = planJobs(rule(), comment(), NOW).map((j) => j.dedupeKey);
    const b = planJobs(rule(), comment(), new Date(NOW.getTime() + 5000)).map((j) => j.dedupeKey);
    expect(a).toEqual(b);
  });

  it("turns a private_reply into a message for DM triggers and drops comment replies", () => {
    const jobs = planJobs(rule({ trigger_type: "dm_keyword" }), message({ text: "link" }), NOW);
    expect(jobs.map((j) => j.kind)).toEqual(["message", "message"]);
    expect(jobs[0].payload.commentId).toBeUndefined();
  });
});
