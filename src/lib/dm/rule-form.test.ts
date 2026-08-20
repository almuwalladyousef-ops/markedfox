import { describe, expect, it } from "vitest";

import { describeRule, readRuleForm, validateRuleForm, type RuleFormValues } from "./rule-form";

const base: RuleFormValues = {
  name: "Send the guide",
  connectionId: "conn-1",
  trigger: "comment",
  keywordMode: "keywords",
  keywords: "link, guide",
  keywordMatch: "contains",
  postScope: "any",
  postIds: [],
  dmText: "Here is the guide!",
  buttonTitle: "Get the guide",
  buttonUrl: "https://example.com/guide",
  commentReplyText: "Sent you a DM 📩",
  followUps: [{ text: "Did you get it?", delayMinutes: 60 }],
  oncePerContact: true,
};

describe("validateRuleForm", () => {
  it("builds the canonical comment rule: private reply with a button, public reply, a delayed follow-up", () => {
    const out = validateRuleForm(base);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.draft).toEqual({
      name: "Send the guide",
      connection_id: "conn-1",
      trigger_type: "comment",
      keywords: ["link", "guide"],
      target_post_ids: [],
      actions: [
        { type: "private_reply", text: "Here is the guide!", buttons: [{ title: "Get the guide", url: "https://example.com/guide" }] },
        { type: "comment_reply", text: "Sent you a DM 📩" },
        { type: "message", text: "Did you get it?", delay_seconds: 3600 },
      ],
      config: { keyword_match: "contains", once_per_contact: true },
    });
  });

  it("names what is missing in the user's words", () => {
    const out = validateRuleForm({ ...base, name: "", connectionId: "", dmText: "", keywords: "  " });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errors.name).toMatch(/name/);
    expect(out.errors.connection_id).toMatch(/account/);
    expect(out.errors.dm_text).toMatch(/message/);
    expect(out.errors.keywords).toMatch(/keyword/);
  });

  it("refuses a DM rule without keywords (it would answer every message)", () => {
    const out = validateRuleForm({ ...base, trigger: "dm_keyword", keywordMode: "any", keywords: "" });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.errors.keywords).toMatch(/every message/);
  });

  it("requires posts when scoped to specific posts, and a full https link for the button", () => {
    expect(validateRuleForm({ ...base, postScope: "specific", postIds: [] }).ok).toBe(false);
    const bad = validateRuleForm({ ...base, buttonUrl: "example.com/guide" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.button_url).toMatch(/https/);
    const noButton = validateRuleForm({ ...base, buttonTitle: "", buttonUrl: "" });
    expect(noButton.ok).toBe(true);
    if (noButton.ok) expect(noButton.draft.actions[0]).toEqual({ type: "private_reply", text: "Here is the guide!" });
  });

  it("caps follow-up delays at 7 days and turns DM triggers into plain messages", () => {
    const tooLong = validateRuleForm({ ...base, followUps: [{ text: "x", delayMinutes: 8 * 24 * 60 }] });
    expect(tooLong.ok).toBe(false);
    const dm = validateRuleForm({ ...base, trigger: "dm_keyword", commentReplyText: "ignored" });
    expect(dm.ok).toBe(true);
    if (dm.ok) {
      expect(dm.draft.actions[0].type).toBe("message");
      expect(dm.draft.actions.some((a) => a.type === "comment_reply")).toBe(false);
    }
  });
});

describe("readRuleForm", () => {
  it("reads the builder's fields, including indexed follow-ups and repeated post ids", () => {
    const fd = new FormData();
    fd.set("name", " Guide ");
    fd.set("connection_id", "c");
    fd.set("trigger", "comment");
    fd.set("keyword_mode", "keywords");
    fd.set("keywords", "link");
    fd.set("keyword_match", "exact");
    fd.set("post_scope", "specific");
    fd.append("post_ids", "m1");
    fd.append("post_ids", "m2");
    fd.set("dm_text", "hi");
    fd.set("followup_text_0", "one");
    fd.set("followup_delay_0", "30");
    fd.set("followup_text_1", "");
    fd.set("followup_text_2", "three");
    fd.set("followup_delay_2", "1440");
    fd.set("once_per_contact", "off");
    expect(readRuleForm(fd)).toMatchObject({
      name: "Guide",
      keywordMatch: "exact",
      postScope: "specific",
      postIds: ["m1", "m2"],
      followUps: [
        { text: "one", delayMinutes: 30 },
        { text: "three", delayMinutes: 1440 },
      ],
      oncePerContact: false,
    });
  });
});

describe("describeRule", () => {
  it("reads like a sentence", () => {
    const out = validateRuleForm(base);
    if (!out.ok) throw new Error("unexpected");
    expect(describeRule(out.draft)).toBe("When someone comments “link” or “guide” on any post → send 2 DMs and reply publicly");
    expect(describeRule({ trigger_type: "dm_keyword", keywords: ["price"], target_post_ids: [], actions: [{ type: "message", text: "x" }] })).toBe(
      "When someone DMs “price” → send a DM",
    );
  });
});
