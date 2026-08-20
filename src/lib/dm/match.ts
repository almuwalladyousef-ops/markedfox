import type { DmJobDraft, DmRule, DmStep, InboundEvent, KeywordMatch } from "./types";

// Which rules an inbound event fires, and the sends each one produces. Pure.
//
// Tenancy note: the rules handed in here are already the ones belonging to
// the connection the event landed on (the store looks them up by
// platform_account_id). A comment on user A's post can only ever meet user
// A's rules because the store never returns anyone else's — the Phase 4 exit
// criterion "a comment on A's post never triggers B's rule" is enforced by
// that lookup, and pinned by the engine test, not by anything in here.

const normalise = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export function matchesKeywords(text: string, keywords: string[], mode: KeywordMatch = "contains"): boolean {
  if (keywords.length === 0) return true;
  const haystack = normalise(text);
  if (!haystack) return false;
  return keywords.some((k) => {
    const needle = normalise(k);
    if (!needle) return false;
    return mode === "exact" ? haystack === needle : haystack.includes(needle);
  });
}

// Does this rule fire for this event? Owner's own activity never counts.
export function ruleMatches(rule: DmRule, event: InboundEvent): boolean {
  if (!rule.enabled || rule.actions.length === 0) return false;
  if (event.from.id === event.platformAccountId) return false;
  const mode = rule.config.keyword_match ?? "contains";

  switch (event.kind) {
    case "comment":
      if (rule.trigger_type !== "comment") return false;
      // Replies to comments are conversations, not new commenters — a rule
      // that answers every reply in a thread would spam.
      if (event.parentCommentId) return false;
      if (rule.target_post_ids.length > 0 && (!event.mediaId || !rule.target_post_ids.includes(event.mediaId))) {
        return false;
      }
      return matchesKeywords(event.text, rule.keywords, mode);
    case "message":
      if (event.echo) return false;
      if (event.storyReply) {
        if (rule.trigger_type === "story_reply") return matchesKeywords(event.text, rule.keywords, mode);
        // A dm_keyword rule also sees story replies: they arrive as DMs.
      }
      if (rule.trigger_type !== "dm_keyword") return false;
      return matchesKeywords(event.text, rule.keywords, mode);
    case "postback":
      return false;
  }
}

// Turn a matched rule into job drafts. The dedupe key ties each send to the
// triggering event and step, so a replayed webhook (same externalId) plans
// the same keys and inserts nothing new.
export function planJobs(rule: DmRule, event: InboundEvent, now: Date): DmJobDraft[] {
  const drafts: DmJobDraft[] = [];
  const commentId = event.kind === "comment" ? event.externalId.replace(/^ig-comment:/, "") : undefined;

  rule.actions.forEach((step: DmStep, index) => {
    const base = {
      connectionId: rule.connection_id,
      ruleId: rule.id,
      userId: rule.user_id,
      workspaceId: rule.workspace_id,
      contactPlatformUserId: event.from.id,
      dedupeKey: `${rule.id}:${event.externalId}:${index}`,
    };
    switch (step.type) {
      case "private_reply":
        // Only meaningful in answer to a comment; for a DM trigger the same
        // words go out as an ordinary message.
        drafts.push({
          ...base,
          kind: commentId ? "private_reply" : "message",
          payload: { text: step.text, buttons: step.buttons, commentId, stepIndex: index },
          runAt: now,
        });
        break;
      case "message":
        drafts.push({
          ...base,
          kind: "message",
          payload: {
            text: step.text,
            buttons: step.buttons,
            stepIndex: index,
            ...(step.skip_if_clicked ? { skipIfClicked: true } : {}),
            ...(step.collect ? { collect: step.collect } : {}),
          },
          runAt: new Date(now.getTime() + (step.delay_seconds ?? 0) * 1000),
        });
        break;
      case "comment_reply":
        if (!commentId) break; // nothing to reply under
        drafts.push({
          ...base,
          kind: "comment_reply",
          payload: { text: step.text, commentId, stepIndex: index },
          runAt: now,
        });
        break;
    }
  });
  return drafts;
}
