import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Platform } from "@/lib/platforms/types";

// One row per costed action — the source of truth every cap in canUserDo reads.
// Phase 2 exit criterion: "every costed action writes a usage row."
//
// Failures throw. Swallowing them would undercount, and undercounting X posts
// is a direct dollar cost (rule: X is never unlimited). Callers that costed
// money BEFORE recording (a publish that already went out) should catch, log
// loudly, and continue; callers that record BEFORE spending should fail the
// action instead.

export type UsageKind =
  | "post_publish"
  | "x_post"
  | "dm_send"
  | "video_upload"
  | "ai_call";

export async function recordUsage(
  supabase: SupabaseClient,
  entry: {
    userId: string;
    workspaceId: string;
    kind: UsageKind;
    /** Defaults to 1; video_upload passes minutes, ai_call passes tokens/cost units. */
    amount?: number;
    platform?: Platform;
    /** The row this usage came from (scheduled_post id, dm_rule id, …). */
    refId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.from("usage").insert({
    user_id: entry.userId,
    workspace_id: entry.workspaceId,
    kind: entry.kind,
    amount: entry.amount ?? 1,
    platform: entry.platform ?? null,
    ref_id: entry.refId ?? null,
    metadata: entry.metadata ?? {},
  });
  if (error) throw error;
}
