import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service";

import {
  createSyncStore,
  listStaleSources,
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

export const SOURCE_REFRESH_HOURS = 24;
export const SWEEP_BATCH = 3;

export interface SweepSummary {
  considered: number;
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
  const cutoff = new Date(now.getTime() - SOURCE_REFRESH_HOURS * 3_600_000);

  const service = createServiceRoleClient();
  const rows = await listStaleSources(service, cutoff, batch);
  if (rows.length === 0) {
    return { considered: 0, synced: 0, failed: 0, outliers: 0 };
  }

  // Service role: RLS is not filtering here, so every write goes through the
  // source's own user_id and workspace_id, which came off the row itself.
  const results = await syncSources(
    rows.map(toStoredSource),
    createSyncStore(service),
    { now },
  );

  return {
    considered: rows.length,
    synced: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    outliers: results.reduce((total, r) => total + r.outliers, 0),
  };
}
