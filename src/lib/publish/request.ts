import {
  PLATFORMS,
  type MediaRef,
  type Platform,
  type PlatformPublishOptions,
} from "@/lib/platforms/types";

import type { PlatformOverride, PlatformOverrides } from "./types";

// Parses the body of POST /api/posts. Pure: no I/O, no framework imports, so
// the shape rules are unit-tested and the route stays a thin wrapper.
//
// Shape errors (wrong types, too many items) are reported per field. Content
// rules (caption limits, media rules) are NOT here — validate.ts owns those
// per platform, and the route runs it against each target after this passes.

export type CreatePostRequest = {
  workspaceId: string;
  caption: string;
  media: MediaRef[];
  targetConnectionIds: string[];
  platformOverrides: PlatformOverrides;
  /** null = publish now. */
  scheduledFor: Date | null;
  /**
   * Park it instead of publishing or scheduling.
   *
   * A draft is half a post by definition, so it skips the target and content
   * checks entirely — refusing to save one because the caption is still too
   * long for X is how people lose work. Nothing about a draft is published, so
   * nothing about it needs to be publishable yet.
   */
  draft: boolean;
  /** The draft row being replaced, when one is being reopened and saved. */
  draftId: string | null;
};

export type FieldIssue = { field: string; message: string };

export type ParsedRequest =
  | { ok: true; value: CreatePostRequest }
  | { ok: false; issues: FieldIssue[] };

// Generous ceilings that only exist to bound abuse; the real per-platform
// numbers are in each adapter's rules. MAX_MEDIA_ITEMS must be at least the
// largest rules.mediaMax any adapter declares (TikTok photo posts take 35),
// or the composer's live validation and the API disagree — registry.test.ts
// pins that.
export const MAX_CAPTION_BYTES = 70_000;
export const MAX_MEDIA_ITEMS = 35;
export const MAX_MEDIA_URL_LENGTH = 2048;
// Per-platform options are a small flat bag of primitives; these bounds only
// exist so a hostile body cannot store a novel in jsonb.
export const MAX_OPTION_KEYS = 24;
export const MAX_OPTION_STRING_LENGTH = 200;

function parsePublishOptions(raw: unknown): PlatformPublishOptions | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > MAX_OPTION_KEYS) return null;
  const out: PlatformPublishOptions = {};
  for (const [key, value] of entries) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(key)) return null;
    if (typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) {
      out[key] = value;
    } else if (typeof value === "string") {
      if (value.length > MAX_OPTION_STRING_LENGTH) return null;
      out[key] = value;
    } else {
      return null;
    }
  }
  return out;
}
export const MAX_TARGETS = 25;
// Something scheduled more than a year out is almost certainly a typo in the
// year, and the composer's picker will not offer it either.
export const MAX_SCHEDULE_AHEAD_MS = 366 * 24 * 60 * 60 * 1000;
// A "scheduled" time already in the past by more than this is refused rather
// than silently published now — the user picked a time; if the clock has
// moved past it, they should see that.
export const PAST_TOLERANCE_MS = 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseCreatePostRequest(body: unknown, now = new Date()): ParsedRequest {
  const issues: FieldIssue[] = [];
  const issue = (field: string, message: string) => issues.push({ field, message });

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, issues: [{ field: "body", message: "Expected a JSON object." }] };
  }
  const b = body as Record<string, unknown>;

  // workspaceId
  const workspaceId = typeof b.workspaceId === "string" ? b.workspaceId : "";
  if (!UUID.test(workspaceId)) issue("workspaceId", "workspaceId must be a workspace id.");

  // caption
  let caption = "";
  if (b.caption === undefined || b.caption === null) {
    caption = "";
  } else if (typeof b.caption === "string") {
    caption = b.caption;
    if (new TextEncoder().encode(caption).length > MAX_CAPTION_BYTES) {
      issue("caption", "That caption is far beyond what any platform accepts.");
    }
  } else {
    issue("caption", "caption must be a string.");
  }

  // media
  const media: MediaRef[] = [];
  if (b.media === undefined || b.media === null) {
    // no media
  } else if (!Array.isArray(b.media)) {
    issue("media", "media must be an array.");
  } else if (b.media.length > MAX_MEDIA_ITEMS) {
    issue("media", `At most ${MAX_MEDIA_ITEMS} media items per post.`);
  } else {
    b.media.forEach((item, i) => {
      if (typeof item !== "object" || item === null) {
        issue(`media[${i}]`, "Each media item must be an object.");
        return;
      }
      const { url, type, mime } = item as Record<string, unknown>;
      if (typeof url !== "string" || !url.trim()) {
        issue(`media[${i}].url`, "Media needs a URL.");
        return;
      }
      if (url.length > MAX_MEDIA_URL_LENGTH) {
        issue(`media[${i}].url`, "That URL is too long.");
        return;
      }
      if (type !== "image" && type !== "video") {
        issue(`media[${i}].type`, 'Media type must be "image" or "video".');
        return;
      }
      media.push({
        url: url.trim(),
        type,
        ...(typeof mime === "string" ? { mime } : {}),
      });
    });
  }

  const draft = b.draft === true;
  let draftId: string | null = null;
  if (b.draftId !== undefined && b.draftId !== null && b.draftId !== "") {
    if (typeof b.draftId !== "string" || !UUID.test(b.draftId)) {
      issue("draftId", "draftId must be a post id.");
    } else {
      draftId = b.draftId;
    }
  }

  // targets
  let targetConnectionIds: string[] = [];
  if (!Array.isArray(b.targetConnectionIds)) {
    // A draft with nowhere to go yet is a normal draft.
    if (!draft) {
      issue("targetConnectionIds", "Choose at least one account to post to.");
    }
  } else {
    const ids = b.targetConnectionIds.filter(
      (id): id is string => typeof id === "string" && UUID.test(id),
    );
    if (ids.length !== b.targetConnectionIds.length) {
      issue("targetConnectionIds", "Every target must be a connection id.");
    }
    targetConnectionIds = Array.from(new Set(ids));
    if (targetConnectionIds.length === 0 && !draft) {
      issue("targetConnectionIds", "Choose at least one account to post to.");
    } else if (targetConnectionIds.length > MAX_TARGETS) {
      issue("targetConnectionIds", `At most ${MAX_TARGETS} accounts per post.`);
    }
  }

  // overrides
  const platformOverrides: PlatformOverrides = {};
  if (b.platformOverrides !== undefined && b.platformOverrides !== null) {
    if (
      typeof b.platformOverrides !== "object" ||
      Array.isArray(b.platformOverrides)
    ) {
      issue("platformOverrides", "platformOverrides must be an object keyed by platform.");
    } else {
      for (const [key, value] of Object.entries(
        b.platformOverrides as Record<string, unknown>,
      )) {
        if (!(PLATFORMS as readonly string[]).includes(key)) {
          issue(`platformOverrides.${key}`, "Unknown platform.");
          continue;
        }
        if (typeof value !== "object" || value === null) {
          issue(`platformOverrides.${key}`, "Override must be an object.");
          continue;
        }
        const override = value as Record<string, unknown>;
        const parsed: PlatformOverride = {};
        if (override.caption !== undefined) {
          if (typeof override.caption !== "string") {
            issue(`platformOverrides.${key}.caption`, "Override caption must be a string.");
            continue;
          }
          if (new TextEncoder().encode(override.caption).length > MAX_CAPTION_BYTES) {
            issue(`platformOverrides.${key}.caption`, "That caption is far beyond what any platform accepts.");
            continue;
          }
          parsed.caption = override.caption;
        }
        if (override.options !== undefined) {
          const options = parsePublishOptions(override.options);
          if (!options) {
            issue(
              `platformOverrides.${key}.options`,
              `Options must be an object of at most ${MAX_OPTION_KEYS} string/number/boolean values.`,
            );
            continue;
          }
          parsed.options = options;
        }
        if (parsed.caption === undefined && parsed.options === undefined) continue;
        platformOverrides[key as Platform] = parsed;
      }
    }
  }

  // schedule
  let scheduledFor: Date | null = null;
  if (b.scheduledFor !== undefined && b.scheduledFor !== null && b.scheduledFor !== "") {
    if (typeof b.scheduledFor !== "string") {
      issue("scheduledFor", "scheduledFor must be an ISO 8601 timestamp.");
    } else {
      const parsed = new Date(b.scheduledFor);
      if (Number.isNaN(parsed.getTime())) {
        issue("scheduledFor", "scheduledFor must be an ISO 8601 timestamp.");
      } else if (!draft && parsed.getTime() < now.getTime() - PAST_TOLERANCE_MS) {
        issue("scheduledFor", "That time has already passed. Pick a future time or publish now.");
      } else if (parsed.getTime() > now.getTime() + MAX_SCHEDULE_AHEAD_MS) {
        issue("scheduledFor", "Posts can be scheduled up to a year ahead.");
      } else {
        // Within tolerance of now counts as now: it would be due on the very
        // next tick anyway, and the user asked for it "now-ish".
        // A draft keeps whatever time was typed, even one in the past: it is
        // not going anywhere until the user says so, and silently clearing it
        // loses information they entered.
        scheduledFor =
          !draft && parsed.getTime() <= now.getTime() ? null : parsed;
      }
    }
  }

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    value: {
      workspaceId,
      caption,
      media,
      targetConnectionIds,
      platformOverrides,
      scheduledFor,
      draft,
      draftId,
    },
  };
}
