import type { Platform } from "@/lib/platforms/types";

// Shapes shared by the DM engine's pure parts (webhook parsing, matching,
// job planning, the worker) and its Supabase store. No I/O here.

// ── rules ──────────────────────────────────────────────────────────────────

export type DmTriggerType = "comment" | "dm_keyword" | "story_reply" | "new_follower";

export type DmButton = {
  title: string;
  /** Destination. The engine wraps it in a tracked /r/<token> redirect at send. */
  url: string;
};

// One thing a rule does when it fires. A rule's `actions` is an ordered list.
export type DmStep =
  | {
      /** The one DM Meta allows in answer to a comment (recipient = comment). */
      type: "private_reply";
      text: string;
      buttons?: DmButton[];
    }
  | {
      /** A DM inside the 24-hour window: keyword replies and follow-ups. */
      type: "message";
      text: string;
      buttons?: DmButton[];
      /** Wait this long after the trigger before sending (follow-ups). */
      delay_seconds?: number;
    }
  | {
      /** A public reply under the triggering comment. */
      type: "comment_reply";
      text: string;
    };

export type KeywordMatch = "contains" | "exact";

export type DmRuleConfig = {
  /** How `keywords` match the text. Default "contains", case-insensitive. */
  keyword_match?: KeywordMatch;
  /** Only fire once per person for this rule (default true for comment rules). */
  once_per_contact?: boolean;
};

export type DmRule = {
  id: string;
  user_id: string;
  workspace_id: string;
  connection_id: string;
  name: string;
  enabled: boolean;
  trigger_type: DmTriggerType;
  /** Empty = any text. */
  keywords: string[];
  /** Empty = any post. Platform media ids. */
  target_post_ids: string[];
  actions: DmStep[];
  config: DmRuleConfig;
};

// ── inbound events ─────────────────────────────────────────────────────────

export type InboundEvent =
  | {
      kind: "comment";
      platform: Platform;
      /** The platform's own id for this event — the dedupe key. */
      externalId: string;
      /** Which connected account it happened on (IG user id). */
      platformAccountId: string;
      from: { id: string; username?: string };
      text: string;
      mediaId?: string;
      /** Set when this is a reply to another comment. */
      parentCommentId?: string;
      occurredAt: Date;
    }
  | {
      kind: "message";
      platform: Platform;
      externalId: string;
      platformAccountId: string;
      from: { id: string; username?: string };
      text: string;
      /** True when the message is a reply to one of the account's stories. */
      storyReply: boolean;
      /** True when the account itself sent it (echo) — never a trigger. */
      echo: boolean;
      occurredAt: Date;
    }
  | {
      kind: "postback";
      platform: Platform;
      externalId: string;
      platformAccountId: string;
      from: { id: string; username?: string };
      payload: string;
      title?: string;
      occurredAt: Date;
    };

// ── jobs ───────────────────────────────────────────────────────────────────

export type DmJobKind = "private_reply" | "message" | "comment_reply";

export type DmJobPayload = {
  text: string;
  buttons?: DmButton[];
  /** For private_reply and comment_reply: the comment being answered. */
  commentId?: string;
  /** Which step of the rule this is (for analytics). */
  stepIndex: number;
};

export type DmJobDraft = {
  connectionId: string;
  ruleId: string;
  userId: string;
  workspaceId: string;
  contactPlatformUserId: string;
  kind: DmJobKind;
  payload: DmJobPayload;
  dedupeKey: string;
  runAt: Date;
};

export type DmJobRow = {
  id: string;
  user_id: string;
  workspace_id: string;
  connection_id: string;
  rule_id: string | null;
  contact_id: string | null;
  kind: DmJobKind;
  payload: DmJobPayload;
  dedupe_key: string;
  run_at: string;
  status: "pending" | "sending" | "sent" | "failed" | "skipped";
  attempts: number;
  last_error: string | null;
  platform_message_id: string | null;
};

export type DmEventKind =
  | "triggered"
  | "sent"
  | "failed"
  | "skipped"
  | "clicked"
  | "tapped"
  | "replied";
