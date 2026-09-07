import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getFreshConnectionTokens, type ConnectionRow } from "@/lib/connections/store";
import { PlatformAuthError } from "@/lib/platforms/errors";
import { PLATFORM_LABELS } from "@/lib/platforms/labels";
import { getPlatform } from "@/lib/platforms/registry";
import type { AccountMediaItem, AccountProfile } from "@/lib/platforms/types";

// Filling the home screen's cache from the platforms themselves.
//
// Every read here is expensive in a way page loads are not allowed to be:
// Meta and TikTok rate-limit per app, so every MarkedFox user shares one
// budget, and X bills per request. So a sync is throttled, the background
// sweep only touches accounts nobody has refreshed in hours, and metered
// platforms are never swept at all — somebody has to ask for those.

/** A manual refresh does nothing if the account was read this recently. Short,
 *  because the button exists for "I just posted, show it". */
export const REFRESH_THROTTLE_MS = 2 * 60 * 1000;
/** How old a cached account has to be before the scheduler tick re-reads it. */
export const SWEEP_STALE_MS = 6 * 60 * 60 * 1000;
/** Accounts read per tick. The tick runs every minute, so this is a slow drip
 *  by design rather than a thundering herd against Meta once every six hours. */
export const SWEEP_BATCH = 5;
/** Reads in flight at once during a workspace refresh. A person with ten
 *  accounts should not wait ten round trips end to end, and ten simultaneous
 *  Graph calls from one user is not what the app budget is at risk from. */
const CONCURRENCY = 4;

export type SyncSkip = "unsupported" | "metered" | "throttled" | "inactive";

export interface SyncOutcome {
  connectionId: string;
  ok: boolean;
  skipped?: SyncSkip;
  /** The sentence shown on the account's card when a read failed. */
  error?: string;
  mediaCount?: number;
}

interface SyncOptions {
  /** Ignore the throttle — the refresh button. */
  force?: boolean;
  /** Include platforms that bill per read. Never true on the sweep. */
  includeMetered?: boolean;
  /** How many posts to pull per account. */
  limit?: number;
}

/** Read one connected account and write what came back into the cache. Never
 *  throws for a platform-side failure: a dead Instagram must not stop the
 *  other nine accounts from refreshing, so the failure is recorded on the row
 *  and the screen explains it. */
export async function syncConnection(
  supabase: SupabaseClient,
  connection: Pick<
    ConnectionRow,
    "id" | "user_id" | "workspace_id" | "platform" | "status"
  >,
  options: SyncOptions = {},
): Promise<SyncOutcome> {
  // A platform with no adapter at all (linkedin, pinterest) throws rather
  // than returning undefined, and it means the same thing here as a platform
  // with no read API: nothing to sync.
  let insights;
  try {
    insights = getPlatform(connection.platform).insights;
  } catch {
    insights = undefined;
  }
  if (!insights) {
    return { connectionId: connection.id, ok: false, skipped: "unsupported" };
  }
  if (insights.metered && !options.includeMetered) {
    return { connectionId: connection.id, ok: false, skipped: "metered" };
  }
  if (connection.status !== "active") {
    // A revoked or expired grant cannot be read, and trying would just spend
    // a request to learn what the status column already says.
    return { connectionId: connection.id, ok: false, skipped: "inactive" };
  }

  if (!options.force) {
    const { data } = await supabase
      .from("account_profiles")
      .select("last_synced_at")
      .eq("connection_id", connection.id)
      .maybeSingle();
    const last = (data as { last_synced_at: string | null } | null)?.last_synced_at;
    if (last && Date.now() - new Date(last).getTime() < REFRESH_THROTTLE_MS) {
      return { connectionId: connection.id, ok: true, skipped: "throttled" };
    }
  }

  let profile: AccountProfile;
  let media: AccountMediaItem[];
  try {
    const { row, tokens } = await getFreshConnectionTokens(supabase, connection.id);
    const input = {
      tokens,
      platformAccountId: row.platform_account_id,
      metadata: row.metadata,
    };
    // Sequential on purpose: two calls to the same platform for the same
    // account, one after the other, is the polite shape and the profile call
    // is the one that tells us the token still works.
    profile = await insights.readProfile(input);
    media = await insights.listMedia({ ...input, limit: options.limit ?? 36 });
  } catch (error) {
    const message = describe(error, connection.platform);
    await markProfileError(supabase, connection, insights.primaryMetric, message);
    return { connectionId: connection.id, ok: false, error: message };
  }

  await writeProfile(supabase, connection, profile, insights.primaryMetric, null);
  const written = await writeMedia(supabase, connection, media);
  return { connectionId: connection.id, ok: true, mediaCount: written };
}

/** Every connected account in one workspace, a few at a time. */
export async function syncWorkspace(
  supabase: SupabaseClient,
  workspaceId: string,
  options: SyncOptions = {},
): Promise<SyncOutcome[]> {
  const { data, error } = await supabase
    .from("connections")
    .select("id, user_id, workspace_id, platform, status")
    .eq("workspace_id", workspaceId);
  if (error) throw error;

  const connections = (data ?? []) as unknown as Pick<
    ConnectionRow,
    "id" | "user_id" | "workspace_id" | "platform" | "status"
  >[];

  const outcomes: SyncOutcome[] = [];
  for (let i = 0; i < connections.length; i += CONCURRENCY) {
    const batch = connections.slice(i, i + CONCURRENCY);
    outcomes.push(
      ...(await Promise.all(
        batch.map((connection) => syncConnection(supabase, connection, options)),
      )),
    );
  }
  return outcomes;
}

/** The scheduler tick's share of the work: the few accounts nobody has looked
 *  at in the longest, never the metered ones. */
export async function sweepStaleAccounts(
  supabase: SupabaseClient,
  options: { limit?: number; now?: Date } = {},
): Promise<SyncOutcome[]> {
  const limit = options.limit ?? SWEEP_BATCH;
  const now = options.now ?? new Date();

  const { data, error } = await supabase
    .from("connections")
    .select("id, user_id, workspace_id, platform, status")
    .eq("status", "active")
    .limit(500);
  if (error) throw error;

  const connections = (data ?? []) as unknown as Pick<
    ConnectionRow,
    "id" | "user_id" | "workspace_id" | "platform" | "status"
  >[];
  if (connections.length === 0) return [];

  const { data: profileRows } = await supabase
    .from("account_profiles")
    .select("connection_id, last_synced_at")
    .in(
      "connection_id",
      connections.map((connection) => connection.id),
    );
  const syncedAt = new Map(
    ((profileRows ?? []) as { connection_id: string; last_synced_at: string | null }[]).map(
      (row) => [row.connection_id, row.last_synced_at],
    ),
  );

  const due = connections
    .filter((connection) => {
      const last = syncedAt.get(connection.id);
      // Never synced sorts first: an account connected a minute ago should
      // appear on the home screen without waiting six hours.
      return !last || now.getTime() - new Date(last).getTime() >= SWEEP_STALE_MS;
    })
    .sort((a, b) => {
      const left = syncedAt.get(a.id);
      const right = syncedAt.get(b.id);
      if (!left) return -1;
      if (!right) return 1;
      return new Date(left).getTime() - new Date(right).getTime();
    })
    .slice(0, limit);

  const outcomes: SyncOutcome[] = [];
  for (const connection of due) {
    outcomes.push(await syncConnection(supabase, connection, { force: true }));
  }
  return outcomes;
}

function describe(error: unknown, platform: string): string {
  const label = PLATFORM_LABELS[platform as keyof typeof PLATFORM_LABELS] ?? platform;
  if (error instanceof PlatformAuthError) {
    // The common case is a connection authorized before this screen existed,
    // so its grant is missing the read scope. Both that and a genuinely dead
    // token are fixed by the same action.
    return `Reconnect ${label} to include its stats — the current connection cannot read the account.`;
  }
  return error instanceof Error ? error.message : String(error);
}

async function writeProfile(
  supabase: SupabaseClient,
  connection: Pick<ConnectionRow, "id" | "user_id" | "workspace_id" | "platform">,
  profile: AccountProfile,
  primaryMetric: "views" | "likes",
  lastError: string | null,
): Promise<void> {
  const { error } = await supabase.from("account_profiles").upsert(
    {
      connection_id: connection.id,
      user_id: connection.user_id,
      workspace_id: connection.workspace_id,
      platform: connection.platform,
      handle: profile.handle ?? null,
      display_name: profile.displayName ?? null,
      avatar_url: profile.avatarUrl ?? null,
      bio: profile.bio ?? null,
      profile_url: profile.profileUrl ?? null,
      followers: profile.followers ?? null,
      following: profile.following ?? null,
      post_count: profile.postCount ?? null,
      primary_metric: primaryMetric,
      // A failed read still stamps the time: otherwise the sweep would retry
      // the same broken account every tick forever.
      last_synced_at: new Date().toISOString(),
      last_error: lastError,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "connection_id" },
  );
  if (error) throw error;
}

/** A failed read records what went wrong WITHOUT overwriting the numbers the
 *  last successful read found. A platform being down for an hour should not
 *  blank somebody's follower count — a stale number with a warning beside it
 *  is more use than no number at all. */
async function markProfileError(
  supabase: SupabaseClient,
  connection: Pick<ConnectionRow, "id" | "user_id" | "workspace_id" | "platform">,
  primaryMetric: "views" | "likes",
  message: string,
): Promise<void> {
  const now = new Date().toISOString();
  const { data } = await supabase
    .from("account_profiles")
    .select("connection_id")
    .eq("connection_id", connection.id)
    .maybeSingle();

  if (data) {
    // The timestamp moves even on a failure, so the sweep does not retry the
    // same broken account on every tick forever.
    const { error } = await supabase
      .from("account_profiles")
      .update({ last_error: message, last_synced_at: now, updated_at: now })
      .eq("connection_id", connection.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("account_profiles").insert({
    connection_id: connection.id,
    user_id: connection.user_id,
    workspace_id: connection.workspace_id,
    platform: connection.platform,
    primary_metric: primaryMetric,
    last_synced_at: now,
    last_error: message,
  });
  if (error) throw error;
}

async function writeMedia(
  supabase: SupabaseClient,
  connection: Pick<ConnectionRow, "id" | "user_id" | "workspace_id" | "platform">,
  media: AccountMediaItem[],
): Promise<number> {
  const items = media.filter((item) => item.externalId);
  if (items.length === 0) return 0;

  const now = new Date().toISOString();
  const { error } = await supabase.from("account_media").upsert(
    items.map((item) => ({
      connection_id: connection.id,
      user_id: connection.user_id,
      workspace_id: connection.workspace_id,
      platform: connection.platform,
      external_id: item.externalId,
      kind: item.kind,
      duration_seconds: item.durationSeconds ?? null,
      caption: item.caption ?? null,
      permalink: item.permalink ?? null,
      thumbnail_url: item.thumbnailUrl ?? null,
      views: item.views ?? null,
      likes: item.likes ?? null,
      comments: item.comments ?? null,
      shares: item.shares ?? null,
      posted_at: item.postedAt ?? null,
      synced_at: now,
    })),
    { onConflict: "connection_id,external_id" },
  );
  if (error) throw error;

  await pruneDeleted(supabase, connection.id, items);
  return items.length;
}

/** A post deleted on the platform should leave the grid. Only rows inside the
 *  window this read actually covered are considered — anything older was not
 *  asked for and its absence says nothing. */
async function pruneDeleted(
  supabase: SupabaseClient,
  connectionId: string,
  items: AccountMediaItem[],
): Promise<void> {
  const timestamps = items
    .map((item) => item.postedAt)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));
  if (timestamps.length === 0) return;

  const oldest = new Date(Math.min(...timestamps)).toISOString();
  const { data } = await supabase
    .from("account_media")
    .select("id, external_id")
    .eq("connection_id", connectionId)
    .gte("posted_at", oldest);

  const seen = new Set(items.map((item) => item.externalId));
  const gone = ((data ?? []) as { id: string; external_id: string }[])
    .filter((row) => !seen.has(row.external_id))
    .map((row) => row.id);
  if (gone.length === 0) return;

  await supabase.from("account_media").delete().in("id", gone);
}
