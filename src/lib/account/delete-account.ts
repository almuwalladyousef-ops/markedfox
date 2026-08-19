import "server-only";

import { getConnectionTokens } from "@/lib/connections/store";
import { keyForPublicUrl } from "@/lib/media/purge";
import { createMediaStore, isMediaStorageConfigured } from "@/lib/media/store";
import { getPlatform } from "@/lib/platforms/registry";
import { createServiceRoleClient } from "@/lib/supabase/service";

// Deleting an account for real — the Phase 5 requirement ("account deletion
// endpoint, which Meta requires") and the Phase 6 exit criterion ("account
// deletion genuinely removes all data").
//
// Order matters:
//   1. revoke every connection's grant at its platform (best-effort) while
//      the tokens still exist to do it with;
//   2. delete the media objects this user's posts reference, because once
//      the post rows are gone the orphan sweep would only find them two days
//      later;
//   3. delete the auth user, which cascades through public.users into every
//      tenant table (workspaces, connections, posts, history, rules, usage,
//      subscriptions) — one statement, no table list to keep in sync.
//
// Service-role throughout: the user's own client cannot delete from
// auth.users, and after step 3 there is no user left to scope a query to.

export type AccountDeletionSummary = {
  connectionsRevoked: number;
  connectionsSkipped: number;
  mediaDeleted: number;
};

export async function deleteAccount(
  userId: string,
  log: Pick<Console, "warn" | "error"> = console,
): Promise<AccountDeletionSummary> {
  const service = createServiceRoleClient();
  const summary: AccountDeletionSummary = {
    connectionsRevoked: 0,
    connectionsSkipped: 0,
    mediaDeleted: 0,
  };

  // 1. Platform-side revokes.
  const { data: connections, error: connectionsError } = await service
    .from("connections")
    .select("id, platform")
    .eq("user_id", userId);
  if (connectionsError) throw connectionsError;

  for (const connection of connections ?? []) {
    try {
      const adapter = getPlatform(connection.platform);
      if (!adapter.revoke) {
        summary.connectionsSkipped += 1;
        continue;
      }
      const { tokens } = await getConnectionTokens(service, connection.id);
      await adapter.revoke(tokens);
      summary.connectionsRevoked += 1;
    } catch (error) {
      summary.connectionsSkipped += 1;
      log.warn(
        `delete-account: revoke ${connection.platform} ${connection.id} failed — ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // 2. Media in storage.
  if (isMediaStorageConfigured()) {
    const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL ?? "";
    const { data: posts, error: postsError } = await service
      .from("scheduled_posts")
      .select("media")
      .eq("user_id", userId)
      .is("media_purged_at", null);
    if (postsError) throw postsError;

    const keys = new Set<string>();
    for (const post of posts ?? []) {
      const media = Array.isArray(post.media) ? post.media : [];
      for (const item of media) {
        const url = item && typeof item === "object" ? (item as { url?: unknown }).url : null;
        if (typeof url !== "string") continue;
        const key = keyForPublicUrl(url, publicBaseUrl);
        if (key) keys.add(key);
      }
    }
    const media = createMediaStore();
    for (const key of keys) {
      try {
        await media.delete(key);
        summary.mediaDeleted += 1;
      } catch (error) {
        // The orphan sweep catches anything missed here within two days.
        log.warn(
          `delete-account: could not delete media ${key} — ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  // 3. The user, and everything hanging off them.
  const { error } = await service.auth.admin.deleteUser(userId);
  if (error) throw error;

  return summary;
}
