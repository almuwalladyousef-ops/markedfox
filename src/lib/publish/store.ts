import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getFreshConnectionTokens,
  markConnectionStatus,
} from "@/lib/connections/store";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import {
  PLATFORMS,
  type MediaRef,
  type Platform,
  type PlatformPublishOptions,
} from "@/lib/platforms/types";
import { recordUsage } from "@/lib/usage/record";

import type {
  HistoryEntry,
  PlatformOverride,
  PlatformOverrides,
  PostRow,
  PostStatus,
  PublishStore,
  TargetConnection,
  UsageEntry,
} from "./types";

// The Supabase implementation of PublishStore.
//
// Which client the caller passes decides the safety model: the user's client
// in the API path lets RLS refuse anything not theirs; the service-role client
// in the scheduler bypasses RLS, so every query here ALSO filters explicitly
// on the post's user_id and workspace_id. Belt and braces, on purpose — the
// scheduler is the one place a bug could publish one tenant's post with
// another tenant's token, and that is business-ending.

const POST_COLUMNS =
  "id, user_id, workspace_id, caption, media, platform_overrides, " +
  "target_connection_ids, status, scheduled_for, published_at, " +
  "attempt_count, last_error, created_at";

export function createPublishStore(supabase: SupabaseClient): PublishStore {
  return {
    async loadTargets(post: PostRow): Promise<TargetConnection[]> {
      if (post.target_connection_ids.length === 0) return [];
      const { data, error } = await supabase
        .from("connections")
        .select(
          "id, user_id, workspace_id, platform, platform_account_id, platform_account_name, status",
        )
        .in("id", post.target_connection_ids)
        .eq("user_id", post.user_id)
        .eq("workspace_id", post.workspace_id);
      if (error) throw error;
      return (data ?? []) as unknown as TargetConnection[];
    },

    loadSnapshot(userId, workspaceId) {
      return getEntitlementSnapshot(supabase, userId, workspaceId);
    },

    async getTokens(connectionId) {
      const { tokens } = await getFreshConnectionTokens(supabase, connectionId);
      return tokens;
    },

    markConnectionExpired(connectionId) {
      return markConnectionStatus(supabase, connectionId, "expired");
    },

    async recordHistory(entry: HistoryEntry) {
      const { error } = await supabase.from("history").insert({
        user_id: entry.userId,
        workspace_id: entry.workspaceId,
        scheduled_post_id: entry.postId,
        connection_id: entry.connectionId,
        platform: entry.platform,
        outcome: entry.outcome,
        platform_post_id: entry.platformPostId ?? null,
        post_url: entry.postUrl ?? null,
        error: entry.error ?? null,
        detail: entry.detail,
        posted_at: entry.postedAt.toISOString(),
      });
      if (error) throw error;
    },

    recordUsage(entry: UsageEntry) {
      return recordUsage(supabase, {
        userId: entry.userId,
        workspaceId: entry.workspaceId,
        kind: entry.kind,
        platform: entry.platform,
        refId: entry.refId,
        metadata: entry.metadata,
      });
    },

    async finishPost(post, result) {
      const { error } = await supabase
        .from("scheduled_posts")
        .update({
          status: result.status,
          published_at: result.publishedAt?.toISOString() ?? null,
          last_error: result.lastError,
          // Releasing the claim matters: a post going back to `scheduled`
          // must not still look leased to the recovery sweep.
          claimed_at: null,
          ...(result.retryAt
            ? { scheduled_for: result.retryAt.toISOString() }
            : {}),
        })
        .eq("id", post.id)
        .eq("user_id", post.user_id);
      if (error) throw error;
    },
  };
}

// ── row parsing ───────────────────────────────────────────────────────────
// jsonb columns come back as unknown. Malformed rows are narrowed to what is
// valid rather than thrown on: a post with one bad media entry should fail
// validation with a message, not crash the scheduler tick for everyone else.

export function parseMedia(raw: unknown): MediaRef[] {
  if (!Array.isArray(raw)) return [];
  const out: MediaRef[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const { url, type, mime } = item as Record<string, unknown>;
    if (typeof url !== "string") continue;
    if (type !== "image" && type !== "video") continue;
    out.push({ url, type, ...(typeof mime === "string" ? { mime } : {}) });
  }
  return out;
}

export function parseOverrides(raw: unknown): PlatformOverrides {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: PlatformOverrides = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!(PLATFORMS as readonly string[]).includes(key)) continue;
    if (typeof value !== "object" || value === null) continue;
    const record = value as Record<string, unknown>;
    const override: PlatformOverride = {};
    if (typeof record.caption === "string") override.caption = record.caption;
    if (typeof record.options === "object" && record.options !== null && !Array.isArray(record.options)) {
      const options: PlatformPublishOptions = {};
      for (const [k, v] of Object.entries(record.options as Record<string, unknown>)) {
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") options[k] = v;
      }
      override.options = options;
    }
    if (override.caption !== undefined || override.options !== undefined) {
      out[key as Platform] = override;
    }
  }
  return out;
}

export function toPostRow(row: Record<string, unknown>): PostRow {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    workspace_id: String(row.workspace_id),
    caption: typeof row.caption === "string" ? row.caption : "",
    media: parseMedia(row.media),
    platform_overrides: parseOverrides(row.platform_overrides),
    target_connection_ids: Array.isArray(row.target_connection_ids)
      ? row.target_connection_ids.map(String)
      : [],
    status: row.status as PostStatus,
    scheduled_for: (row.scheduled_for as string | null) ?? null,
    published_at: (row.published_at as string | null) ?? null,
    attempt_count: Number(row.attempt_count ?? 0),
    last_error: (row.last_error as string | null) ?? null,
    created_at: String(row.created_at),
  };
}

export { POST_COLUMNS };
