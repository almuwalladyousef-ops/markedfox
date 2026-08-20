import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service";

import {
  createSyncStore,
  listStaleSources,
  refreshHoursForUser,
  toStoredSource,
} from "./store";
import { syncSources } from "./sync";

// The background refresh, run from the scheduler tick.
//
// Two caps, both about spending someone else's budget carefully:
//
//   * A source is only refreshed once a day. View counts move slowly and every
//     platform meters reads — YouTube by quota, X by the dollar.
//   * At most SWEEP_BATCH sources per tick. The tick runs every minute, so a
//     small batch still covers hundreds of sources a day while making it
//     impossible for one tick to exhaust the daily YouTube quota.

/** The LOOSEST interval any plan grants — the net the query casts before each
 *  candidate is filtered against its own owner's plan. */
export const MAX_REFRESH_HOURS = 24;
export const SWEEP_BATCH = 3;

export interface SweepSummary {
  considered: number;
  /** Candidates whose owner's plan does not entitle them to a refresh yet. */
  notDueYet: number;
  synced: number;
  failed: number;
  outliers: number;
}

export async function sweepResearchSources(options?: {
  now?: Date;
  batch?: number;
}): Promise<SweepSummary> {
  const now = options?.now ?? new Date();
  const batch = options?.batch ?? SWEEP_BATCH;
  // Cast the widest net the loosest plan allows, then filter per owner.
  const cutoff = new Date(now.getTime() - MAX_REFRESH_HOURS * 3_600_000);

  const service = createServiceRoleClient();
  // Over-fetch, because some candidates will not be due on their own plan and
  // a batch of three that filters down to zero would stall the sweep.
  const candidates = await listStaleSources(service, cutoff, batch * 4);
  if (candidates.length === 0) {
    return { considered: 0, notDueYet: 0, synced: 0, failed: 0, outliers: 0 };
  }

  // One plan lookup per distinct owner, not per source.
  const hoursByUser = new Map<string, number>();
  const due = [];
  let notDueYet = 0;

  for (const row of candidates) {
    if (due.length >= batch) break;

    let hours = hoursByUser.get(row.user_id);
    if (hours === undefined) {
      hours = await refreshHoursForUser(service, row.user_id);
      hoursByUser.set(row.user_id, hours);
    }

    const lastSynced = row.last_synced_at ? Date.parse(row.last_synced_at) : null;
    const isDue =
      lastSynced === null || now.getTime() - lastSynced >= hours * 3_600_000;
    if (isDue) due.push(row);
    else notDueYet += 1;
  }

  if (due.length === 0) {
    return { considered: 0, notDueYet, synced: 0, failed: 0, outliers: 0 };
  }

  // Service role: RLS is not filtering here, so every write goes through the
  // source's own user_id and workspace_id, which came off the row itself.
  const results = await syncSources(
    due.map(toStoredSource),
    createSyncStore(service),
    { now },
  );

  return {
    considered: due.length,
    notDueYet,
    synced: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    outliers: results.reduce((total, r) => total + r.outliers, 0),
  };
}
