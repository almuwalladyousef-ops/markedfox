import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AccountMediaKind, Platform } from "@/lib/platforms/types";

import {
  MEDIA_PAGE_SIZE,
  type AccountMediaRow,
  type AccountProfileRow,
  type MediaFilter,
} from "./types";

export { totalsFrom } from "./totals";

// Reading the home screen's cache. Every query filters by workspace and runs
// through the caller's client, so RLS is what decides which rows come back —
// the workspace filter is about which of the user's own workspaces is on
// screen, not about tenancy.

const PROFILE_COLUMNS =
  "connection_id, platform, handle, display_name, avatar_url, bio, " +
  "profile_url, followers, following, post_count, primary_metric, " +
  "last_synced_at, last_error";

const MEDIA_COLUMNS =
  "id, connection_id, platform, external_id, kind, caption, permalink, " +
  "thumbnail_url, views, likes, comments, shares, posted_at";

export async function listAccountProfiles(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<AccountProfileRow[]> {
  const { data, error } = await supabase
    .from("account_profiles")
    .select(PROFILE_COLUMNS)
    .eq("workspace_id", workspaceId);
  if (error) throw error;

  return ((data ?? []) as unknown as {
    connection_id: string;
    platform: Platform;
    handle: string | null;
    display_name: string | null;
    avatar_url: string | null;
    bio: string | null;
    profile_url: string | null;
    followers: number | null;
    following: number | null;
    post_count: number | null;
    primary_metric: "views" | "likes";
    last_synced_at: string | null;
    last_error: string | null;
  }[]).map((row) => ({
    connectionId: row.connection_id,
    platform: row.platform,
    handle: row.handle,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    profileUrl: row.profile_url,
    followers: row.followers,
    following: row.following,
    postCount: row.post_count,
    primaryMetric: row.primary_metric,
    lastSyncedAt: row.last_synced_at,
    lastError: row.last_error,
  }));
}

export async function listAccountMedia(
  supabase: SupabaseClient,
  workspaceId: string,
  filter: MediaFilter,
): Promise<{ items: AccountMediaRow[]; hasMore: boolean }> {
  // `page` counts how many times "Load more" has been pressed, and the query
  // asks for everything up to that point rather than one slice: the grid is a
  // scroll, so a second page has to arrive UNDER the first, not replace it.
  // Postgres still does the filtering and the limiting.
  const size = (filter.page + 1) * MEDIA_PAGE_SIZE;
  let query = supabase
    .from("account_media")
    .select(MEDIA_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("posted_at", { ascending: false, nullsFirst: false })
    // One extra row is the whole "is there more" question, answered without a
    // second count query.
    .range(0, size);

  if (filter.platform) query = query.eq("platform", filter.platform);
  if (filter.connectionId) query = query.eq("connection_id", filter.connectionId);
  if (filter.kind) query = query.eq("kind", filter.kind);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as unknown as {
    id: string;
    connection_id: string;
    platform: Platform;
    external_id: string;
    kind: AccountMediaKind;
    caption: string | null;
    permalink: string | null;
    thumbnail_url: string | null;
    views: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    posted_at: string | null;
  }[];

  const hasMore = rows.length > size;
  return {
    hasMore,
    items: rows.slice(0, size).map((row) => ({
      id: row.id,
      connectionId: row.connection_id,
      platform: row.platform,
      externalId: row.external_id,
      kind: row.kind,
      caption: row.caption,
      permalink: row.permalink,
      thumbnailUrl: row.thumbnail_url,
      views: row.views,
      likes: row.likes,
      comments: row.comments,
      shares: row.shares,
      postedAt: row.posted_at,
    })),
  };
}
