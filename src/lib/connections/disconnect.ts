import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getPlatform } from "@/lib/platforms/registry";

import { getConnectionTokens, type ConnectionRow } from "./store";

// Disconnecting one account: best-effort revoke at the platform, then delete
// our row — tokens included. The privacy policy promises exactly this, and
// it is the user-facing half of what the Meta callbacks do unprompted.
//
// The caller passes the user-scoped client, so RLS decides whether the row
// is theirs to delete: a connection id belonging to someone else reads as
// not found and nothing happens.
//
// The revoke is best-effort on purpose. Our copy of the token is the thing
// we control and the thing the policy is about; a platform revoke endpoint
// being down must not leave the user unable to disconnect.

export class ConnectionNotFoundError extends Error {
  constructor(connectionId: string) {
    super(`connection ${connectionId} not found`);
    this.name = "ConnectionNotFoundError";
  }
}

export async function disconnectConnection(
  supabase: SupabaseClient,
  connectionId: string,
  log: Pick<Console, "warn"> = console,
): Promise<{ row: ConnectionRow; revoked: boolean }> {
  let row: ConnectionRow;
  let tokens;
  try {
    ({ row, tokens } = await getConnectionTokens(supabase, connectionId));
  } catch {
    throw new ConnectionNotFoundError(connectionId);
  }

  let revoked = false;
  try {
    const adapter = getPlatform(row.platform);
    if (adapter.revoke) {
      await adapter.revoke(tokens);
      revoked = true;
    }
  } catch (error) {
    log.warn(
      `disconnect: platform revoke for ${row.platform} ${row.id} failed — ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const { error } = await supabase.from("connections").delete().eq("id", connectionId);
  if (error) throw error;
  return { row, revoked };
}
