import "server-only";

import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import { createServiceRoleClient } from "@/lib/supabase/service";



import { parseBreakdown } from "./breakdown";
import {
  annotateResearchCredit,
  releaseResearchCredit,
  reserveResearchCredit,
} from "./credits";
import { usableTranscript } from "./transcribe";
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
  // Thresholds are only applied when the rule actually sets one. A `>= 0`
  // filter is not a no-op in SQL: it rejects NULLs, and engagement_rate is
  // NULL for every video whose view count did not come back — so a rule
  // configured to accept everything would silently skip them.
  const minViews = Number(rule.min_views);
  const minEngagement = Number(rule.min_engagement_rate);
  const feed = await listFeed(service, rule.workspace_id, {
    minScore: Number(rule.min_outlier_score),
    ...(minViews > 0 ? { minViews } : {}),
    ...(minEngagement > 0 ? { minEngagement } : {}),
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

    // The daily ceiling, counted from what THIS RULE has spent today. Counting
    // the workspace's whole AI usage would mean a morning spent writing
    // scripts by hand silently switched every rule off, and would make the
    // page's "these rules can spend N a day" wrong by the number of rules.
    const spentToday = await countRuleAnalysesToday(service, rule.id, now);
    if (spentToday >= rule.daily_limit) {
      skipped += 1;
      break;
    }

    // Reserved atomically against the rule's OWNER, not the rule — credits are
    // pooled per user, so a sweep firing while that user is generating a script
    // in the browser must not let both through the same last credit.
    const reservation = await reserveResearchCredit(service, {
      userId: rule.user_id,
      workspaceId: rule.workspace_id,
      monthlyLimit: snapshot.limits.researchCreditsPerMonth,
      refId: video.id,
      metadata: {
        feature: "research",
        kind: "breakdown",
        automation: rule.id,
      },
    });
    if (!reservation) {
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
          transcript: usableTranscript(transcript),
          outlierScore:
            video.outlier_score === null ? null : Number(video.outlier_score),
          durationSeconds: video.duration_seconds,
        }),
      );

      const breakdown = parseBreakdown(result.output);
      if (!breakdown) {
        // An unreadable answer costs the user nothing, exactly as when they
        // press the button themselves.
        await releaseResearchCredit(service, rule.user_id, reservation);
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

      await annotateResearchCredit(service, rule.user_id, reservation, {
        feature: "research",
        kind: "breakdown",
        model: result.model,
        // Kept, because countRuleAnalysesToday reads it to enforce the
        // per-rule daily ceiling.
        automation: rule.id,
      });

      analyzed += 1;
    } catch (error) {
      await releaseResearchCredit(service, rule.user_id, reservation);
      failed += 1;
      // A provider that is down or unconfigured is not worth retrying against
      // the rest of the batch — it will fail identically for each.
      if (error instanceof GenerationError) break;
    }
  }

  return { analyzed, skipped, failed };
}

/**
 * Analyses THIS RULE has run today.
 *
 * Every automated breakdown writes a usage row tagged with the rule that
 * ordered it, so the ceiling is counted from the ledger rather than from a
 * counter that could drift. The monthly credit cap in canUserDo is what stops
 * several rules adding up to more than the plan allows; this is the per-rule
 * promise the form makes.
 */
async function countRuleAnalysesToday(
  service: ReturnType<typeof createServiceRoleClient>,
  ruleId: string,
  now: Date,
): Promise<number> {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);

  const { count, error } = await service
    .from("usage")
    .select("id", { count: "exact", head: true })
    .eq("kind", "ai_call")
    .eq("metadata->>automation", ruleId)
    .gte("occurred_at", start.toISOString());
  if (error) throw error;
  return count ?? 0;
}
