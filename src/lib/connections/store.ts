import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { decryptToken, encryptToken } from "@/lib/crypto";
import { getPlatform, listRegisteredPlatforms } from "@/lib/platforms/registry";
import type {
  ConnectedAccount,
  ConnectionTokens,
  Platform,
} from "@/lib/platforms/types";

import {
  refreshWithRaceRecovery,
  type ExpiringConnection,
  type RefreshStore,
} from "./refresh";

// The only code that touches connections' token columns. Tokens are AES-256-GCM
// envelopes from src/lib/crypto.ts — plaintext never reaches a query, a log, or
// a return value except through getConnectionTokens.
//
// Callers pass their own Supabase client on purpose: routes pass the
// user-scoped client so RLS applies, background jobs pass the service-role
// client and are responsible for their own explicit filtering.

export type ConnectionRow = {
  id: string;
  user_id: string;
  workspace_id: string;
  platform: Platform;
  platform_account_id: string;
  platform_account_name: string | null;
  token_expires_at: string | null;
  scopes: string[];
  status: "active" | "expired" | "revoked" | "error";
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

// Every column except the two encrypted ones. Listing queries must never pull
// ciphertext into result sets that end up serialized to a page.
const PUBLIC_COLUMNS =
  "id, user_id, workspace_id, platform, platform_account_id, " +
  "platform_account_name, token_expires_at, scopes, status, metadata, " +
  "created_at, updated_at";

export async function saveConnection(
  supabase: SupabaseClient,
  input: {
    userId: string;
    workspaceId: string;
    platform: Platform;
    account: ConnectedAccount;
    /** Fallback tokens when the account carries no per-account override. */
    tokens: ConnectionTokens;
  },
): Promise<ConnectionRow> {
  const tokens = input.account.tokens ?? input.tokens;

  const { data, error } = await supabase
    .from("connections")
    .upsert(
      {
        user_id: input.userId,
        workspace_id: input.workspaceId,
        platform: input.platform,
        platform_account_id: input.account.platformAccountId,
        platform_account_name: input.account.platformAccountName ?? null,
        access_token_encrypted: encryptToken(tokens.accessToken),
        refresh_token_encrypted: tokens.refreshToken
          ? encryptToken(tokens.refreshToken)
          : null,
        token_expires_at: tokens.expiresAt?.toISOString() ?? null,
        scopes: tokens.scopes ?? [],
        status: "active",
        metadata: input.account.metadata ?? {},
      },
      // Reconnecting the same account overwrites its tokens instead of failing
      // the unique constraint — that is what a user retrying a connect expects.
      { onConflict: "user_id,workspace_id,platform,platform_account_id" },
    )
    .select(PUBLIC_COLUMNS)
    .single();

  if (error) throw error;
  // No generated DB types yet (Phase 2 adds `supabase gen types`); the select
  // string defeats inference, so route through unknown.
  return data as unknown as ConnectionRow;
}

export async function listConnections(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<ConnectionRow[]> {
  const { data, error } = await supabase
    .from("connections")
    .select(PUBLIC_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as ConnectionRow[];
}

// Decrypted tokens for one connection — the only exit point for plaintext.
export async function getConnectionTokens(
  supabase: SupabaseClient,
  connectionId: string,
): Promise<{ row: ConnectionRow; tokens: ConnectionTokens }> {
  const { data, error } = await supabase
    .from("connections")
    .select(`${PUBLIC_COLUMNS}, access_token_encrypted, refresh_token_encrypted`)
    .eq("id", connectionId)
    .single();

  if (error) throw error;

  const tokens: ConnectionTokens = {
    accessToken: decryptToken(data.access_token_encrypted),
    refreshToken: data.refresh_token_encrypted
      ? decryptToken(data.refresh_token_encrypted)
      : undefined,
    expiresAt: data.token_expires_at
      ? new Date(data.token_expires_at)
      : undefined,
    scopes: data.scopes,
  };

  // Strip the ciphertext columns before the row leaves this module.
  const row = { ...data } as Record<string, unknown>;
  delete row.access_token_encrypted;
  delete row.refresh_token_encrypted;
  return { row: row as unknown as ConnectionRow, tokens };
}

export async function markConnectionStatus(
  supabase: SupabaseClient,
  connectionId: string,
  status: ConnectionRow["status"],
): Promise<void> {
  const { error } = await supabase
    .from("connections")
    .update({ status })
    .eq("id", connectionId);
  if (error) throw error;
}

// Refresh threshold: Meta long-lived tokens last ~60 days and refresh by
// re-exchange while still valid, so renewing a week early costs nothing and
// absorbs a scheduler outage of days without any token dying.
export const REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// For "on-use" platforms the stored access token lives hours (X 2h, Snapchat
// and YouTube 1h, TikTok 24h) and the refresh token behind it is what keeps
// the connection alive — and on X and TikTok that refresh token is
// single-use and ROTATES. Applying the 7-day window to those would rotate
// the refresh token on every single publish, which is both needless and the
// widest possible surface for two concurrent publishes to collide on one
// single-use token. So they refresh only when the access token is actually
// about to lapse.
export const ON_USE_REFRESH_MARGIN_MS = 5 * 60 * 1000;

// One refresh per connection per process at a time. Two concurrent publishes
// that both find the token near expiry share a single refresh instead of
// racing each other to redeem the same refresh token. Process-local is
// enough: the app is one Node process on one box (CLAUDE.md), and
// refreshWithRaceRecovery covers the cross-process case anyway.
const inflightRefreshes = new Map<string, Promise<{ row: ConnectionRow; tokens: ConnectionTokens }>>();

// Server-side refresh — the Phase 2 requirement that background jobs never
// hold stale tokens and no browser session is ever involved. Returns fresh
// tokens, refreshing and persisting first when expiry is near.
export async function getFreshConnectionTokens(
  supabase: SupabaseClient,
  connectionId: string,
): Promise<{ row: ConnectionRow; tokens: ConnectionTokens }> {
  const inflight = inflightRefreshes.get(connectionId);
  if (inflight) return inflight;

  const { row, tokens } = await getConnectionTokens(supabase, connectionId);

  const adapter = getPlatform(row.platform);
  const margin =
    adapter.refreshPolicy === "on-use" ? ON_USE_REFRESH_MARGIN_MS : REFRESH_WINDOW_MS;
  const needsRefresh =
    tokens.expiresAt !== undefined &&
    tokens.expiresAt.getTime() - Date.now() < margin;
  if (!needsRefresh) return { row, tokens };

  const refreshing = refreshConnection(supabase, connectionId, adapter, { row, tokens }).finally(
    () => inflightRefreshes.delete(connectionId),
  );
  inflightRefreshes.set(connectionId, refreshing);
  return refreshing;
}

async function refreshConnection(
  supabase: SupabaseClient,
  connectionId: string,
  adapter: ReturnType<typeof getPlatform>,
  { row, tokens }: { row: ConnectionRow; tokens: ConnectionTokens },
): Promise<{ row: ConnectionRow; tokens: ConnectionTokens }> {
  // Rotating refresh tokens (X, TikTok) plus concurrent publishes mean a
  // refusal here might be "someone else just rotated it" rather than "the
  // grant is dead" — refreshWithRaceRecovery re-reads before deciding.
  return refreshWithRaceRecovery({
    initial: { row, tokens },
    refresh: (current) => adapter.refresh(current),
    reread: () => getConnectionTokens(supabase, connectionId),
    markExpired: () => markConnectionStatus(supabase, connectionId, "expired"),
    persist: async (fresh) => {
      const { error } = await supabase
        .from("connections")
        .update({
          access_token_encrypted: encryptToken(fresh.accessToken),
          refresh_token_encrypted: fresh.refreshToken
            ? encryptToken(fresh.refreshToken)
            : null,
          token_expires_at: fresh.expiresAt?.toISOString() ?? null,
          status: "active",
        })
        .eq("id", connectionId);
      if (error) throw error;
    },
  });
}

// The RefreshStore the scheduler's sweep runs against. Service-role client:
// it must see every tenant's connections, so it filters on expiry and status
// rather than on a user.
export function createRefreshStore(supabase: SupabaseClient): RefreshStore {
  return {
    async listExpiring(before: Date): Promise<ExpiringConnection[]> {
      // Only platforms whose stored credential is itself the expiring thing
      // (refreshPolicy "sweep"). An X or YouTube connection's access token
      // expires within hours by design — the refresh token behind it is what
      // keeps it alive, and that renewal happens at publish time. Sweeping on
      // token_expires_at would renew every such connection every minute.
      const swept = listRegisteredPlatforms()
        .filter((a) => a.refreshPolicy === "sweep")
        .map((a) => a.id);
      if (swept.length === 0) return [];

      const { data, error } = await supabase
        .from("connections")
        .select("id, platform, token_expires_at")
        .eq("status", "active")
        .in("platform", swept)
        .not("token_expires_at", "is", null)
        .lt("token_expires_at", before.toISOString())
        .order("token_expires_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: String(row.id),
        platform: row.platform as Platform,
        tokenExpiresAt: (row.token_expires_at as string | null) ?? null,
      }));
    },

    async refresh(connectionId: string): Promise<void> {
      // getFreshConnectionTokens does the whole job — decrypt, call the
      // adapter, re-encrypt, persist — and its own window check passes because
      // listExpiring already selected on the same threshold.
      await getFreshConnectionTokens(supabase, connectionId);
    },
  };
}
