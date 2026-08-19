import { PlatformAuthError } from "@/lib/platforms/errors";
import type { ConnectionTokens, Platform } from "@/lib/platforms/types";

// Renews platform tokens before they lapse, on a timer rather than only when
// something happens to publish.
//
// Why this exists: Meta issues Threads a 60-day user token and there is no
// setting that makes it permanent — but each refresh mints a fresh 60 days,
// so renewing inside the window keeps a connection alive indefinitely. Without
// this sweep an account nobody posted from for two months would simply die,
// and Threads refuses to refresh an already-expired token, so the only repair
// would be the user reconnecting by hand.
//
// Instagram and Facebook store Page tokens, which carry no expiry at all
// (`token_expires_at` is null), so they never appear here. The query is
// deliberately expiry-driven rather than platform-driven: a platform added
// later with expiring tokens is covered without touching this file.
//
// Runs in the scheduler tick with the service-role client, so it sees every
// tenant's connections on purpose — token lifetime is not a per-user concern.

// Which refresh failures mean "this grant is dead, the user must reconnect",
// as opposed to "the platform was briefly unavailable".
//
// The distinction matters more now that renewal runs on a timer rather than
// only during a publish: marking a connection `expired` on a passing 500 or a
// rate limit would make a healthy account ask its owner to reconnect for no
// reason. Only an auth error — revoked grant, changed password, bad secret —
// is a real state change.
export function isDeadGrant(error: unknown): boolean {
  return error instanceof PlatformAuthError;
}

export type ExpiringConnection = {
  id: string;
  platform: Platform;
  /** For logging only; the store decides what to do with it. */
  tokenExpiresAt: string | null;
};

export interface RefreshStore {
  /** Active connections whose tokens expire before `before`. */
  listExpiring(before: Date): Promise<ExpiringConnection[]>;
  /** Renew and persist one connection's tokens. Throws on failure. */
  refresh(connectionId: string): Promise<void>;
}

export type RefreshOutcome =
  | { connectionId: string; platform: Platform; ok: true }
  | { connectionId: string; platform: Platform; ok: false; error: string };

export type RefreshSummary = {
  due: number;
  refreshed: number;
  failed: number;
  outcomes: RefreshOutcome[];
};

export async function refreshExpiringConnections(
  store: RefreshStore,
  options: {
    /** How far ahead to look. Defaults to the store's own window. */
    windowMs: number;
    now?: () => Date;
    log?: Pick<Console, "error" | "log">;
  },
): Promise<RefreshSummary> {
  const now = options.now ?? (() => new Date());
  const log = options.log ?? console;

  const before = new Date(now().getTime() + options.windowMs);
  const due = await store.listExpiring(before);

  const summary: RefreshSummary = {
    due: due.length,
    refreshed: 0,
    failed: 0,
    outcomes: [],
  };

  // Sequential on purpose: this is a handful of rows at most, and hammering a
  // platform's token endpoint in parallel is how an app earns a rate limit on
  // the one call it cannot afford to lose.
  for (const connection of due) {
    try {
      await store.refresh(connection.id);
      summary.refreshed += 1;
      summary.outcomes.push({
        connectionId: connection.id,
        platform: connection.platform,
        ok: true,
      });
      log.log(
        `refresh: renewed ${connection.platform} ${connection.id} (was due ${connection.tokenExpiresAt ?? "unknown"})`,
      );
    } catch (error) {
      // One failure must not stop the others: a dead Threads grant should not
      // cost every other user their renewal.
      const message = error instanceof Error ? error.message : String(error);
      summary.failed += 1;
      summary.outcomes.push({
        connectionId: connection.id,
        platform: connection.platform,
        ok: false,
        error: message,
      });
      log.error(
        `refresh: FAILED ${connection.platform} ${connection.id} — ${message}`,
      );
    }
  }

  return summary;
}

// ── Refresh-token rotation under concurrency ──────────────────────────────
//
// X and TikTok rotate refresh tokens: every refresh returns a new pair and
// the old refresh token dies. Their access tokens live hours, so every
// publish refreshes — and two publishes against the same connection at once
// (a "post now" while the scheduler tick is mid-publish, two tabs) both read
// the same refresh token and both try to redeem it. The platform honours one
// and answers the other with "token invalid", which looks exactly like a
// dead grant.
//
// So a dead-grant verdict is not final until the row has been re-read: if a
// concurrent refresh landed in the meantime, the stored tokens are the
// rotated pair and this caller simply uses them. Only when the row is
// genuinely unchanged is the connection marked expired.

const RACE_RECHECK_DELAYS_MS = [0, 750, 1500];

export type RefreshReadResult<Row extends { updated_at: string; status: string }> = {
  row: Row;
  tokens: ConnectionTokens;
};

export async function refreshWithRaceRecovery<
  Row extends { updated_at: string; status: string },
>(input: {
  initial: RefreshReadResult<Row>;
  refresh: (tokens: ConnectionTokens) => Promise<ConnectionTokens>;
  persist: (fresh: ConnectionTokens) => Promise<void>;
  /** Re-read the row and its tokens from the database. */
  reread: () => Promise<RefreshReadResult<Row>>;
  markExpired: () => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
}): Promise<RefreshReadResult<Row>> {
  const sleep = input.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));

  let fresh: ConnectionTokens;
  try {
    fresh = await input.refresh(input.initial.tokens);
  } catch (error) {
    // Anything but an auth error is left `active` to be retried — see
    // isDeadGrant.
    if (!isDeadGrant(error)) throw error;

    for (const delay of RACE_RECHECK_DELAYS_MS) {
      if (delay > 0) await sleep(delay);
      const latest = await input.reread();
      const rotatedByAnother =
        latest.row.updated_at !== input.initial.row.updated_at &&
        latest.row.status === "active" &&
        latest.tokens.accessToken !== input.initial.tokens.accessToken;
      if (rotatedByAnother) return latest;
    }

    // Genuinely dead: record it so the UI can show "reconnect needed"
    // instead of silently failing publishes.
    await input.markExpired();
    throw error;
  }

  await input.persist(fresh);
  return { row: input.initial.row, tokens: fresh };
}
