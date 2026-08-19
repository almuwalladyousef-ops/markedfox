import "server-only";

import { randomBytes } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { MetaApp } from "./meta-signed-request";

// What happens when Meta tells us a user is gone.
//
// Two callbacks, two strengths of request:
//
//   deauthorize     the user removed MarkedFox from their Facebook/Instagram
//                   (or Threads) settings. Their tokens are dead on Meta's
//                   side already; ours are deleted so the privacy policy's
//                   "tokens are deleted" is true, and the account simply
//                   shows as not connected.
//   data-deletion   the user asked Meta to have their data removed from us.
//                   Connections AND the publishing history we hold for those
//                   accounts go, and the request is recorded with a
//                   confirmation code Meta hands the user.
//
// Matching: a Facebook-login user is identified by the app-scoped user id
// that connect() stores in metadata.metaUserId on every Instagram and
// Facebook connection; a Threads user by their Threads user id, which IS the
// platform_account_id. The two products sign with different secrets, so the
// verified signature tells us which lookup applies.
//
// Service-role client throughout: these requests arrive with no session, and
// the rows they touch belong to whichever tenant Meta named.

type MatchedConnection = { id: string; user_id: string; platform: string };

export async function findMetaUserConnections(
  service: SupabaseClient,
  app: MetaApp,
  metaUserId: string,
): Promise<MatchedConnection[]> {
  let query = service.from("connections").select("id, user_id, platform");
  query =
    app === "threads"
      ? query.eq("platform", "threads").eq("platform_account_id", metaUserId)
      : query.in("platform", ["instagram", "facebook"]).eq("metadata->>metaUserId", metaUserId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as MatchedConnection[];
}

export async function revokeMetaUser(
  service: SupabaseClient,
  app: MetaApp,
  metaUserId: string,
): Promise<{ connectionsDeleted: number }> {
  const matched = await findMetaUserConnections(service, app, metaUserId);
  if (matched.length === 0) return { connectionsDeleted: 0 };

  const { error } = await service
    .from("connections")
    .delete()
    .in(
      "id",
      matched.map((c) => c.id),
    );
  if (error) throw error;
  return { connectionsDeleted: matched.length };
}

function newConfirmationCode(): string {
  // Short, unambiguous, and unguessable enough for a status lookup: 60 bits.
  return `mf-${randomBytes(8).toString("base64url").replace(/[-_]/g, "").slice(0, 10)}`;
}

export async function deleteMetaUserData(
  service: SupabaseClient,
  app: MetaApp,
  metaUserId: string,
): Promise<{ confirmationCode: string; connectionsDeleted: number; historyDeleted: number }> {
  const confirmationCode = newConfirmationCode();

  // Record first: if anything below fails, the code Meta was given still
  // resolves (to "failed"), which is better than a code that 404s.
  const { error: insertError } = await service.from("deletion_requests").insert({
    confirmation_code: confirmationCode,
    source: app,
    platform_user_id: metaUserId,
  });
  if (insertError) throw insertError;

  try {
    const matched = await findMetaUserConnections(service, app, metaUserId);
    let historyDeleted = 0;
    if (matched.length > 0) {
      const ids = matched.map((c) => c.id);
      // History rows hold Meta-sourced data (post ids, error text) — remove
      // them rather than leaving them pointing at nothing.
      const { data: history, error: historyError } = await service
        .from("history")
        .delete()
        .in("connection_id", ids)
        .select("id");
      if (historyError) throw historyError;
      historyDeleted = history?.length ?? 0;

      const { error: deleteError } = await service.from("connections").delete().in("id", ids);
      if (deleteError) throw deleteError;
    }

    await service
      .from("deletion_requests")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        user_id: matched[0]?.user_id ?? null,
        detail: { connectionsDeleted: matched.length, historyDeleted },
      })
      .eq("confirmation_code", confirmationCode);

    return { confirmationCode, connectionsDeleted: matched.length, historyDeleted };
  } catch (error) {
    await service
      .from("deletion_requests")
      .update({
        status: "failed",
        detail: { error: error instanceof Error ? error.message : String(error) },
      })
      .eq("confirmation_code", confirmationCode);
    throw error;
  }
}

export type DeletionRequestStatus = {
  confirmationCode: string;
  status: "received" | "completed" | "failed";
  requestedAt: string;
  completedAt: string | null;
};

export async function getDeletionRequest(
  service: SupabaseClient,
  confirmationCode: string,
): Promise<DeletionRequestStatus | null> {
  const { data, error } = await service
    .from("deletion_requests")
    .select("confirmation_code, status, requested_at, completed_at")
    .eq("confirmation_code", confirmationCode)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    confirmationCode: data.confirmation_code,
    status: data.status,
    requestedAt: data.requested_at,
    completedAt: data.completed_at,
  };
}
