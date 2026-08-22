import type { AccountProfileRow, AccountTotals } from "./types";

// Pure arithmetic, kept out of store.ts so it can be tested without a database
// — and because the one rule worth pinning by test lives here: a number a
// platform does not report is null, and null is not zero.

/** Sums across the workspace's accounts. Pure, so the arithmetic — especially
 *  "null is not zero" — is testable without a database. */
export function totalsFrom(profiles: AccountProfileRow[]): AccountTotals {
  const sum = (pick: (row: AccountProfileRow) => number | null): number | null => {
    const values = profiles
      .map(pick)
      .filter((value): value is number => value !== null);
    return values.length === 0
      ? null
      : values.reduce((carry, value) => carry + value, 0);
  };

  return {
    followers: sum((row) => row.followers),
    following: sum((row) => row.following),
    posts: sum((row) => row.postCount),
    accounts: profiles.length,
  };
}
