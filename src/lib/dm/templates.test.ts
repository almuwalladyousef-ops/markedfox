import { describe, expect, it } from "vitest";

import { readRuleForm, validateRuleForm, type RuleFormValues } from "./rule-form";
import { getRuleTemplate, RULE_TEMPLATES } from "./templates";

// Templates are the first thing most people build from, so what they promise
// and what they produce have to be the same thing.

const base: RuleFormValues = {
  name: "x",
  folder: "",
  templateId: "",
  connectionId: "conn-1",
  trigger: "comment",
  keywordMode: "keywords",
  keywords: "link",
  keywordMatch: "contains",
  postScope: "any",
  postIds: [],
  dmText: "hi",
  buttonTitle: "",
  buttonUrl: "",
  commentReplyText: "",
  followUps: [],
  oncePerContact: true,
  collectEmail: false,
  emailPrompt: "",
};

describe("rule templates", () => {
  it("leaves exactly one thing for the user: the link", () => {
    // A template that shipped with a link would be shipping somebody else's
    // destination. Everything ELSE must be complete, so filling the URL is
    // enough to make every one of them a valid rule.
    for (const template of RULE_TEMPLATES) {
      const values = { ...base, ...template.values };
      const filled = values.buttonTitle
        ? { ...values, buttonUrl: "https://example.com/thing" }
        : values;

      const result = validateRuleForm(filled);
      expect(
        result.ok,
        `${template.id}: ${JSON.stringify(!result.ok && result.errors)}`,
      ).toBe(true);
    }
  });

  it("a template that offers a button leaves its URL empty", () => {
    for (const template of RULE_TEMPLATES) {
      if (!template.values.buttonTitle) continue;
      expect(template.values.buttonUrl ?? "", template.id).toBe("");
    }
  });

  it("the email template actually collects an email", () => {
    // It used to put the question in the opening DM and never set the flag, so
    // the reply fell through to the matcher and no address was ever stored.
    const template = getRuleTemplate("collect-email");
    expect(template?.values.collectEmail).toBe(true);

    const result = validateRuleForm({ ...base, ...template!.values });
    if (!result.ok) throw new Error("expected ok");
    expect(
      result.draft.actions.some(
        (a) => a.type === "message" && a.collect === "email",
      ),
    ).toBe(true);
  });

  it("anything needing a second message is DM-triggered, not comment-triggered", () => {
    // Meta opens the 24-hour messaging window when the PERSON writes to you.
    // A private reply to a comment does not open it, so a second message on a
    // comment rule is only deliverable to people who wrote back — which is
    // fine for an optional nudge and useless for a required question.
    for (const template of RULE_TEMPLATES) {
      if (!template.values.collectEmail) continue;
      expect(template.trigger, template.id).toBe("dm_keyword");
    }
  });

  it("a template's declared trigger matches the one it fills in", () => {
    for (const template of RULE_TEMPLATES) {
      expect(template.values.trigger, template.id).toBe(template.trigger);
    }
  });

  it("readRuleForm round-trips a template through a form", () => {
    const template = getRuleTemplate("comment-to-link")!;
    const form = new FormData();
    form.set("name", template.values.name!);
    form.set("connection_id", "conn-1");
    form.set("trigger", template.values.trigger!);
    form.set("keyword_mode", "keywords");
    form.set("keywords", template.values.keywords!);
    form.set("dm_text", template.values.dmText!);
    form.set("button_title", template.values.buttonTitle!);
    form.set("button_url", "https://example.com/guide");

    const values = readRuleForm(form);
    const result = validateRuleForm(values);
    expect(result.ok).toBe(true);
  });
});
