import { describe, expect, it } from "vitest";

import { totalsFrom } from "./totals";
import type { AccountProfileRow } from "./types";

// The home screen's headline numbers. The only interesting rule is that a
// platform which does not expose a number is not the same as a platform with
// none of it — a Facebook Page reports no "following" at all, and summing that
// as zero would quietly understate nothing while claiming to be a total.

function profile(overrides: Partial<AccountProfileRow>): AccountProfileRow {
  return {
    connectionId: "c1",
    platform: "instagram",
    handle: null,
    displayName: null,
    avatarUrl: null,
    bio: null,
    profileUrl: null,
    followers: null,
    following: null,
    postCount: null,
    primaryMetric: "likes",
    lastSyncedAt: null,
    lastError: null,
    ...overrides,
  };
}

describe("totalsFrom", () => {
  it("adds up every account that reported a number", () => {
    const totals = totalsFrom([
      profile({ connectionId: "a", followers: 30_000, following: 2, postCount: 79 }),
      profile({ connectionId: "b", followers: 1_200, following: 40, postCount: 12 }),
    ]);
    expect(totals).toEqual({
      followers: 31_200,
      following: 42,
      posts: 91,
      accounts: 2,
    });
  });

  it("ignores the accounts a platform will not report, rather than counting them as zero", () => {
    const totals = totalsFrom([
      profile({ connectionId: "a", followers: 30_000, following: 2 }),
      // A Facebook Page: followers yes, following never.
      profile({ connectionId: "b", platform: "facebook", followers: 500, following: null }),
    ]);
    expect(totals.followers).toBe(30_500);
    expect(totals.following).toBe(2);
  });

  it("returns null, not zero, when nobody reported a number at all", () => {
    const totals = totalsFrom([
      profile({ connectionId: "a" }),
      profile({ connectionId: "b", platform: "threads" }),
    ]);
    expect(totals.followers).toBeNull();
    expect(totals.posts).toBeNull();
    // The account count is always real: they are connected either way.
    expect(totals.accounts).toBe(2);
  });

  it("has no accounts and no numbers before anything is connected", () => {
    expect(totalsFrom([])).toEqual({
      followers: null,
      following: null,
      posts: null,
      accounts: 0,
    });
  });
});
