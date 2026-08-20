import type { DmButton, DmRule, DmRuleConfig, DmStep, DmTriggerType } from "./types";

// Parsing a dm_rules row (jsonb columns) into the typed DmRule, tolerantly:
// a malformed step is dropped rather than crashing the matcher for every
// other rule on the account.

const TRIGGERS: DmTriggerType[] = ["comment", "dm_keyword", "story_reply", "new_follower"];

export const MAX_STEP_TEXT = 1000; // Instagram's per-message ceiling
export const MAX_BUTTON_TITLE = 20;
export const MAX_STEPS = 10;
export const MAX_DELAY_SECONDS = 7 * 24 * 60 * 60;

function parseButtons(raw: unknown): DmButton[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: DmButton[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const b = item as Record<string, unknown>;
    if (typeof b.title !== "string" || typeof b.url !== "string") continue;
    const title = b.title.trim().slice(0, MAX_BUTTON_TITLE);
    if (!title || !/^https?:\/\//i.test(b.url)) continue;
    out.push({ title, url: b.url });
  }
  return out.length > 0 ? out : undefined;
}

export function parseStep(raw: unknown): DmStep | null {
  if (typeof raw !== "object" || raw === null) return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.text !== "string") return null;
  const text = s.text.trim().slice(0, MAX_STEP_TEXT);
  if (!text) return null;
  switch (s.type) {
    case "private_reply":
      return { type: "private_reply", text, buttons: parseButtons(s.buttons) };
    case "message": {
      const delay = typeof s.delay_seconds === "number" && s.delay_seconds > 0
        ? Math.min(Math.floor(s.delay_seconds), MAX_DELAY_SECONDS)
        : undefined;
      return { type: "message", text, buttons: parseButtons(s.buttons), delay_seconds: delay };
    }
    case "comment_reply":
      return { type: "comment_reply", text };
    default:
      return null;
  }
}

export function parseSteps(raw: unknown): DmStep[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parseStep).filter((s): s is DmStep => s !== null).slice(0, MAX_STEPS);
}

export function parseRuleConfig(raw: unknown): DmRuleConfig {
  if (typeof raw !== "object" || raw === null) return {};
  const c = raw as Record<string, unknown>;
  const out: DmRuleConfig = {};
  if (c.keyword_match === "exact" || c.keyword_match === "contains") out.keyword_match = c.keyword_match;
  if (typeof c.once_per_contact === "boolean") out.once_per_contact = c.once_per_contact;
  return out;
}

export function parseRuleRow(row: Record<string, unknown>): DmRule | null {
  const trigger = row.trigger_type;
  if (typeof trigger !== "string" || !(TRIGGERS as string[]).includes(trigger)) return null;
  const strings = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    workspace_id: String(row.workspace_id),
    connection_id: String(row.connection_id),
    name: typeof row.name === "string" ? row.name : "",
    enabled: row.enabled === true,
    trigger_type: trigger as DmTriggerType,
    keywords: strings(row.keywords),
    target_post_ids: strings(row.target_post_ids),
    actions: parseSteps(row.actions),
    config: parseRuleConfig(row.config),
  };
}
