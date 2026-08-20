import "server-only";

import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { recordUsage } from "@/lib/usage/record";

import { parseBreakdown } from "./breakdown";
import { buildBreakdownPrompt } from "./breakdown-prompt";
import { GenerationError, generateFromPrompt } from "./generate";
import {
  breakdownVideoIds,
  getSource,
  getTranscript,
  listFeed,
  saveBreakdown,
} from "./store";
import {
  listDueAutomations,
  markAutomationRun,
  upsertIdea,
  type AutomationRow,
} from "./studio-store";

// Auto-analyze: the rules from /dashboard/research/rules, run from the
// scheduler tick.
//
// This is the only place in the product that spends a user's credits without
// them present, so it is deliberately timid:
//
//   * One rule per tick, and at most a couple of videos from it. The tick runs
//     every minute; a rule that wants five a day gets them across the day
//     rather than in one burst against an AI provider's rate limit.
//   * The plan is re-checked before every single analysis, not once per rule.
//     A user who runs out mid-batch stops mid-batch.
//   * `last_run_at` is stamped whether or not anything was analysed, so a rule
//     matching nothing does not monopolise the queue.

/** How many videos one rule may analyse in a single tick. */
export const AUTO_ANALYZE_PER_TICK = 2;

/** How long after a rule last ran before it is eligible again. Spreads a
 *  daily limit across the day instead of firing it all at once. */
export const AUTO_ANALYZE_COOLDOWN_MINUTES = 30;

export interface AutoAnalyzeSummary {
  rulesConsidered: number;
  ruleRan: string | null;
  analyzed: number;
  skipped: number;
  failed: number;
}

const EMPTY: AutoAnalyzeSummary = {
  rulesConsidered: 0,
  ruleRan: null,
  analyzed: 0,
  skipped: 0,
  failed: 0,
};

export async function runAutoAnalyze(options?: {
  now?: Date;
  perTick?: number;
}): Promise<AutoAnalyzeSummary> {
  const now = options?.now ?? new Date();
  const perTick = options?.perTick ?? AUTO_ANALYZE_PER_TICK;
  const service = createServiceRoleClient();

  const candidates = await listDueAutomations(service, 5);
  if (candidates.length === 0) return EMPTY;

  const cooldownMs = AUTO_ANALYZE_COOLDOWN_MINUTES * 60_000;
  const rule = candidates.find((candidate) => {
    if (!candidate.last_run_at) return true;
    return now.getTime() - Date.parse(candidate.last_run_at) >= cooldownMs;
  });

  if (!rule) {
    return { ...EMPTY, rulesConsidered: candidates.length };
  }

  // Stamped first. If the analysis below throws, the rule still yields its turn
  // rather than jamming the queue with a repeating failure.
  await markAutomationRun(service, rule.id);

  const summary = await runRule(service, rule, now, perTick);
  return { ...summary, rulesConsidered: candidates.length, ruleRan: rule.id };
}

async function runRule(
  service: ReturnType<typeof createServiceRoleClient>,
  rule: AutomationRow,
  now: Date,
  perTick: number,
): Promise<Omit<AutoAnalyzeSummary, "rulesConsidered" | "ruleRan">> {
  let analyzed = 0;
  let skipped = 0;
  let failed = 0;

  // Service role: RLS is not filtering, so the workspace comes off the rule row
  // itself and every write carries the rule's own owner.
  const feed = await listFeed(service, rule.workspace_id, {
    minScore: Number(rule.min_outlier_score),
    minViews: Number(rule.min_views),
    minEngagement: Number(rule.min_engagement_rate),
    sourceIds: rule.source_id ? [rule.source_id] : undefined,
    limit: 40,
  });
  if (feed.length === 0) return { analyzed, skipped, failed };

  const already = await breakdownVideoIds(
    service,
    feed.map((video) => video.id),
  );
  const todo = feed.filter((video) => !already.has(video.id)).slice(0, perTick);

  for (const video of todo) {
    // Re-checked per video, not per rule: a user who runs out of credits
    // halfway through stops halfway through.
    const snapshot = await getEntitlementSnapshot(
      service,
      rule.user_id,
      rule.workspace_id,
    );
    const decision = canUserDo(snapshot, {
      type: "spend_research_credits",
      credits: 1,
    });
    if (!decision.allowed) {
      skipped += 1;
      break;
    }

    // The daily ceiling, counted from what this rule's workspace has actually
    // spent today rather than from a counter that could drift.
    const spentToday = await countAnalysesToday(service, rule.workspace_id, now);
    if (spentToday >= rule.daily_limit) {
      skipped += 1;
      break;
    }

    try {
      const [source, transcript] = await Promise.all([
        getSource(service, video.source_id),
        getTranscript(service, video.id),
      ]);

      const result = await generateFromPrompt(
        buildBreakdownPrompt({
          title: video.title,
          platform: source?.platform ?? "unknown",
          description: video.description,
          transcript:
            transcript && transcript.origin === "captions"
              ? transcript.text
              : null,
          outlierScore:
            video.outlier_score === null ? null : Number(video.outlier_score),
          durationSeconds: video.duration_seconds,
        }),
      );

      const breakdown = parseBreakdown(result.output);
      if (!breakdown) {
        // An unreadable answer costs the user nothing, exactly as when they
        // press the button themselves.
        failed += 1;
        continue;
      }

      await saveBreakdown(service, {
        videoId: video.id,
        userId: rule.user_id,
        workspaceId: rule.workspace_id,
        breakdown,
        model: result.model,
      });

      await upsertIdea(service, {
        userId: rule.user_id,
        workspaceId: rule.workspace_id,
        videoId: video.id,
        title: breakdown.ideaSeed ?? breakdown.uniqueAngle ?? video.title,
        summary: breakdown.summary ?? breakdown.takeaway ?? null,
        origin: "automation",
      });

      await recordUsage(service, {
        userId: rule.user_id,
        workspaceId: rule.workspace_id,
        kind: "ai_call",
        amount: 1,
        refId: video.id,
        metadata: {
          feature: "research",
          kind: "breakdown",
          model: result.model,
          automation: rule.id,
        },
      });

      analyzed += 1;
    } catch (error) {
      failed += 1;
      // A provider that is down or unconfigured is not worth retrying against
      // the rest of the batch — it will fail identically for each.
      if (error instanceof GenerationError) break;
    }
  }

  return { analyzed, skipped, failed };
}

/** Analyses this workspace has run today, automated or not. Counting both is
 *  deliberate: the ceiling is about the credit bill, and a credit spent by hand
 *  costs the same as one spent by a rule. */
async function countAnalysesToday(
  service: ReturnType<typeof createServiceRoleClient>,
  workspaceId: string,
  now: Date,
): Promise<number> {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);

  const { count, error } = await service
    .from("usage")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("kind", "ai_call")
    .gte("occurred_at", start.toISOString());
  if (error) throw error;
  return count ?? 0;
}
