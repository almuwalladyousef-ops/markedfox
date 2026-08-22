import type { AccountMediaKind, Platform } from "@/lib/platforms/types";

// The shapes the home screen reads. Everything here comes out of the two cache
// tables, never from a platform call — the screen renders whatever the last
// sweep found, and says when that was.

export interface AccountProfileRow {
  connectionId: string;
  platform: Platform;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  profileUrl: string | null;
  followers: number | null;
  following: number | null;
  postCount: number | null;
  primaryMetric: "views" | "likes";
  lastSyncedAt: string | null;
  lastError: string | null;
}

export interface AccountMediaRow {
  id: string;
  connectionId: string;
  platform: Platform;
  externalId: string;
  kind: AccountMediaKind;
  caption: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  postedAt: string | null;
}

// Sums across every connected account in the workspace. null means no account
// reported the number at all — "—" on the screen, never a confident zero.
export interface AccountTotals {
  followers: number | null;
  following: number | null;
  posts: number | null;
  accounts: number;
}

export type MediaFilter = {
  platform: Platform | null;
  kind: AccountMediaKind | null;
  /** 0-based. The grid pages rather than loading a whole account's history. */
  page: number;
};

export const MEDIA_PAGE_SIZE = 24;
