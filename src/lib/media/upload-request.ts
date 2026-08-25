import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";

import {
  checkUpload,
  formatBytes,
  MAX_SCHEDULED_VIDEO_BYTES,
  type MediaCheck,
  type UploadContext,
  type UploadIntent,
} from "./policy";

// The checks both upload routes share — the single PUT and the multipart one.
//
// They are here rather than duplicated because the two paths differ only in
// how the bytes travel. What may be uploaded, by whom, into whose workspace,
// and whether it is allowed to sit in the bucket until a scheduled time, is
// the same question either way.

export type { UploadIntent };

export type UploadRefusal = { status: number; error: string; message: string };

export function parseUploadContext(raw: unknown): UploadContext {
  return raw === "long" ? "long" : "short";
}

export function parseUploadIntent(raw: unknown): UploadIntent {
  return raw === "schedule" ? "schedule" : "now";
}

/** The workspace must be the user's: the object key embeds both ids, so this
 *  is what stops one tenant writing under another's prefix. */
export async function assertOwnWorkspace(
  supabase: SupabaseClient,
  userId: string,
  workspaceId: string,
): Promise<UploadRefusal | null> {
  const { data, error } = await supabase
    .from("workspaces")
    .select("id")
    .eq("id", workspaceId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (data) return null;
  return {
    status: 403,
    error: "workspace_not_found",
    message: "That workspace is not yours.",
  };
}

/**
 * Everything about the file itself: type, size against the ceiling for this
 * kind of post, and the two rules that only apply to something being parked
 * until later.
 */
export async function checkUploadRequest(
  supabase: SupabaseClient,
  userId: string,
  input: {
    workspaceId: string;
    contentType: string;
    sizeBytes: number;
    context: UploadContext;
    intent: UploadIntent;
  },
): Promise<{ ok: true; check: Extract<MediaCheck, { ok: true }> } | { ok: false; refusal: UploadRefusal }> {
  const check = checkUpload(input.contentType, input.sizeBytes, input.context);
  if (!check.ok) {
    return {
      ok: false,
      refusal: { status: 413, error: "rejected", message: check.reason },
    };
  }

  if (input.intent === "schedule") {
    // Asked before the upload rather than after, because the alternative is
    // taking someone's whole file and then telling them their plan does not
    // do this.
    const snapshot = await getEntitlementSnapshot(
      supabase,
      userId,
      input.workspaceId,
    );
    const decision = canUserDo(snapshot, { type: "schedule_post" });
    if (!decision.allowed) {
      return {
        ok: false,
        refusal: {
          status: 403,
          error: "schedule_denied",
          message: decision.reason,
        },
      };
    }

    if (check.kind === "video" && input.sizeBytes > MAX_SCHEDULED_VIDEO_BYTES) {
      return {
        ok: false,
        refusal: {
          status: 413,
          error: "schedule_denied",
          message: `A scheduled video has to be under ${formatBytes(MAX_SCHEDULED_VIDEO_BYTES)} — this one is ${formatBytes(input.sizeBytes)}. Post it now instead, or trim it down.`,
        },
      };
    }
  }

  return { ok: true, check };
}

/**
 * An object key belongs to the user and workspace named in its own prefix.
 *
 * Checked on completing and aborting a multipart upload, where the key comes
 * back from the browser rather than being minted here.
 */
export function ownsKey(
  key: string,
  userId: string,
  workspaceId: string,
): boolean {
  return key.startsWith(`${userId}/${workspaceId}/`);
}
