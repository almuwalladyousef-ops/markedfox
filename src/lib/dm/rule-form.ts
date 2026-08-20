import { MAX_BUTTON_TITLE, MAX_DELAY_SECONDS, MAX_STEP_TEXT } from "./rules";
import type { DmRuleConfig, DmStep, DmTriggerType, KeywordMatch } from "./types";

// The rule builder's form → a dm_rules row, and every reason it cannot be
// saved, in the user's words. Pure: the server action calls it, and so can
// a test. The builder is meant to be usable by someone who has never seen
// it, so the messages name the field and what to do.

export type RuleFormValues = {
  name: string;
  /** A label, not a table — see the migration note on dm_rules.folder. */
  folder: string;
  /** Which starter this began as, kept so we can see which ones people use. */
  templateId: string;
  connectionId: string;
  trigger: DmTriggerType;
  /** "any" | "keywords" */
  keywordMode: "any" | "keywords";
  keywords: string;
  keywordMatch: KeywordMatch;
  /** "any" | "specific" */
  postScope: "any" | "specific";
  postIds: string[];
  dmText: string;
  buttonTitle: string;
  buttonUrl: string;
  commentReplyText: string;
  followUps: { text: string; delayMinutes: number; skipIfClicked: boolean }[];
  oncePerContact: boolean;
  /** Ask for an email as a second message, and read the reply as the answer. */
  collectEmail: boolean;
  emailPrompt: string;
};

export type RuleDraft = {
  name: string;
  folder: string | null;
  template_id: string | null;
  connection_id: string;
  trigger_type: DmTriggerType;
  keywords: string[];
  target_post_ids: string[];
  actions: DmStep[];
  config: DmRuleConfig;
};

export type RuleFormResult = { ok: true; draft: RuleDraft } | { ok: false; errors: Record<string, string> };

const TRIGGERS: DmTriggerType[] = ["comment", "dm_keyword", "story_reply"];

export function readRuleForm(formData: FormData): RuleFormValues {
  const str = (name: string) => String(formData.get(name) ?? "").trim();
  const followUps: RuleFormValues["followUps"] = [];
  for (let i = 0; i < 10; i++) {
    const text = str(`followup_text_${i}`);
    const delay = Number(str(`followup_delay_${i}`) || 0);
    if (!text && !formData.has(`followup_text_${i}`)) continue;
    if (text) {
      followUps.push({
        text,
        delayMinutes: Number.isFinite(delay) ? delay : 0,
        skipIfClicked: formData.get(`followup_skip_${i}`) === "on",
      });
    }
  }
  const trigger = str("trigger");
  const keywordMatch = str("keyword_match");
  return {
    name: str("name"),
    folder: str("folder"),
    templateId: str("template_id"),
    connectionId: str("connection_id"),
    trigger: (TRIGGERS as string[]).includes(trigger) ? (trigger as DmTriggerType) : "comment",
    keywordMode: str("keyword_mode") === "keywords" ? "keywords" : "any",
    keywords: str("keywords"),
    keywordMatch: keywordMatch === "exact" ? "exact" : "contains",
    postScope: str("post_scope") === "specific" ? "specific" : "any",
    postIds: formData.getAll("post_ids").map((v) => String(v).trim()).filter(Boolean),
    dmText: str("dm_text"),
    buttonTitle: str("button_title"),
    buttonUrl: str("button_url"),
    commentReplyText: str("comment_reply_text"),
    followUps,
    // A checkbox: present as "on" when ticked, absent when not.
    oncePerContact: formData.get("once_per_contact") === "on",
    collectEmail: formData.get("collect_email") === "on",
    emailPrompt: str("email_prompt"),
  };
}

export function validateRuleForm(values: RuleFormValues): RuleFormResult {
  const errors: Record<string, string> = {};

  const name = values.name.slice(0, 80);
  if (!name) errors.name = "Give the rule a name, like “Send the guide”.";
  if (!values.connectionId) errors.connection_id = "Choose which account this rule runs on.";

  const keywords =
    values.keywordMode === "keywords"
      ? values.keywords
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean)
          .slice(0, 25)
      : [];
  if (values.keywordMode === "keywords" && keywords.length === 0) {
    errors.keywords = "Type at least one keyword, or choose “Any comment”.";
  }
  if (values.trigger === "dm_keyword" && keywords.length === 0) {
    errors.keywords = "A DM rule needs keywords — otherwise it would answer every message.";
  }

  const targetPostIds = values.trigger === "comment" && values.postScope === "specific" ? values.postIds.slice(0, 50) : [];
  if (values.trigger === "comment" && values.postScope === "specific" && targetPostIds.length === 0) {
    errors.post_ids = "Pick at least one post, or choose “Any post”.";
  }

  const dmText = values.dmText.slice(0, MAX_STEP_TEXT);
  if (!dmText) errors.dm_text = "Write the message to send.";

  const buttons: { title: string; url: string }[] = [];
  if (values.buttonTitle || values.buttonUrl) {
    if (!values.buttonTitle) errors.button_title = "Give the link a short label, like “Get the guide”.";
    if (!/^https?:\/\/\S+$/i.test(values.buttonUrl)) errors.button_url = "Enter the full link, starting with https://.";
    if (!errors.button_title && !errors.button_url) {
      buttons.push({ title: values.buttonTitle.slice(0, MAX_BUTTON_TITLE), url: values.buttonUrl });
    }
  }

  const followUps: DmStep[] = [];
  values.followUps.forEach((f, i) => {
    const text = f.text.slice(0, MAX_STEP_TEXT);
    if (!text) return;
    const delaySeconds = Math.max(1, Math.round(f.delayMinutes * 60));
    if (delaySeconds > MAX_DELAY_SECONDS) {
      errors[`followup_delay_${i}`] = "Follow-ups can wait at most 7 days.";
      return;
    }
    followUps.push({
      type: "message",
      text,
      delay_seconds: delaySeconds,
      // Only meaningful when there is a link to have clicked. Silently
      // dropping it otherwise beats a rule that never sends because it is
      // waiting on a click that can never happen.
      ...(f.skipIfClicked && buttons.length > 0 ? { skip_if_clicked: true } : {}),
    });
  });

  // The email question is its own step and comes before any follow-up: asking
  // for an address after a nudge reads as an afterthought, and Instagram's
  // 24-hour window makes the earliest ask the likeliest answer.
  const emailStep: DmStep | null = values.collectEmail
    ? {
        type: "message",
        text:
          (values.emailPrompt || "What's the best email to send it to?").slice(
            0,
            MAX_STEP_TEXT,
          ),
        collect: "email",
      }
    : null;

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const actions: DmStep[] = [];
  if (values.trigger === "comment") {
    actions.push({ type: "private_reply", text: dmText, ...(buttons.length ? { buttons } : {}) });
    if (values.commentReplyText) {
      actions.push({ type: "comment_reply", text: values.commentReplyText.slice(0, 300) });
    }
  } else {
    actions.push({ type: "message", text: dmText, ...(buttons.length ? { buttons } : {}) });
  }
  if (emailStep) actions.push(emailStep);
  actions.push(...followUps);

  return {
    ok: true,
    draft: {
      name,
      folder: values.folder ? values.folder.slice(0, 60) : null,
      template_id: values.templateId ? values.templateId.slice(0, 60) : null,
      connection_id: values.connectionId,
      trigger_type: values.trigger,
      keywords,
      target_post_ids: targetPostIds,
      actions,
      config: { keyword_match: values.keywordMatch, once_per_contact: values.oncePerContact },
    },
  };
}

// A one-line description of what a rule does, for the list.
export function describeRule(rule: {
  trigger_type: DmTriggerType;
  keywords: string[];
  target_post_ids: string[];
  actions: DmStep[];
}): string {
  const when =
    rule.trigger_type === "comment"
      ? `someone comments${rule.keywords.length ? ` “${rule.keywords.join("” or “")}”` : ""} on ${rule.target_post_ids.length ? `${rule.target_post_ids.length} chosen post${rule.target_post_ids.length === 1 ? "" : "s"}` : "any post"}`
      : rule.trigger_type === "dm_keyword"
        ? `someone DMs “${rule.keywords.join("” or “")}”`
        : `someone replies to a story${rule.keywords.length ? ` with “${rule.keywords.join("” or “")}”` : ""}`;
  const dm = rule.actions.filter((a) => a.type !== "comment_reply").length;
  const publicReply = rule.actions.some((a) => a.type === "comment_reply");
  const asksEmail = rule.actions.some(
    (a) => a.type === "message" && a.collect === "email",
  );
  const then = [
    dm > 0 ? `send ${dm === 1 ? "a DM" : `${dm} DMs`}` : null,
    publicReply ? "reply publicly" : null,
    asksEmail ? "ask for their email" : null,
  ]
    .filter(Boolean)
    .join(" and ");
  return `When ${when} → ${then || "do nothing"}`;
}
