import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import type { DenialCode } from "@/lib/entitlements/types";
import { getPlatform } from "@/lib/platforms/registry";
import type { Platform } from "@/lib/platforms/types";

import { containsExternalLink } from "./links";
import { publishPost } from "./publish-post";
import type { CreatePostRequest } from "./request";
import { listContentSpecs } from "./specs";
import { createPublishStore, POST_COLUMNS, toPostRow } from "./store";
import type { PostRow, TargetOutcome } from "./types";
import { validateContent, type ContentIssue, type PlatformContentSpec } from "./validate";

// Everything POST /api/posts does after parsing the body, as a function that
// returns a discriminated result — so the route is a thin HTTP mapping and a
// server action or a native client endpoint can call the same thing.
//
// Order of refusals, all BEFORE any row is written:
//   1. workspace must be the user's (RLS + explicit check)
//   2. every target must be an active connection in that workspace
//   3. the plan must allow it — structural checks (platform locked, X links)
//      always; time-based caps (posts/day, X/month) only for publish-now,
//      because a post scheduled for tomorrow is judged by tomorrow's usage
//      when it is due. Before the adapter check on purpose: "X is not on the
//      Free plan" is the answer a Free user needs, whether or not X has
//      shipped yet.
//   4. every target platform must have an adapter
//   5. content must pass every target platform's rules
// Only then does a scheduled_posts row exist. "Surfaced before publish, never
// as an error after" — the composer shows the same issues live, but this is
// where they are enforced.

export type TargetProblem = {
  connectionId: string;
  platform: Platform | null;
  code: "connection_missing" | "connection_inactive" | "adapter_missing";
  message: string;
};

export type PlanProblem = {
  platform: Platform;
  code: DenialCode;
  message: string;
};

export type CreatePostResult =
  | { kind: "workspace_not_found" }
  | { kind: "bad_targets"; problems: TargetProblem[] }
  | { kind: "invalid_content"; issues: ContentIssue[] }
  | { kind: "plan_denied"; problems: PlanProblem[] }
  | { kind: "scheduled"; post: PostRow }
  | { kind: "published"; post: PostRow; status: "published" | "partial" | "failed"; results: TargetOutcome[] };

// Caps that depend on when the post goes out. Everything else is structural.
const TIME_BASED: ReadonlySet<DenialCode> = new Set(["posts_daily_cap", "x_monthly_cap"]);

type TargetRow = {
  id: string;
  workspace_id: string;
  platform: Platform;
  platform_account_name: string | null;
  status: "active" | "expired" | "revoked" | "error";
};

export async function createPost(
  supabase: SupabaseClient,
  userId: string,
  request: CreatePostRequest,
): Promise<CreatePostResult> {
  // 1. workspace — RLS already hides other tenants' rows; the explicit owner
  //    filter is the belt to that brace.
  const { data: workspace, error: wsError } = await supabase
    .from("workspaces")
    .select("id")
    .eq("id", request.workspaceId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (wsError) throw wsError;
  if (!workspace) return { kind: "workspace_not_found" };

  // 2. targets
  const { data: rows, error: connError } = await supabase
    .from("connections")
    .select("id, workspace_id, platform, platform_account_name, status")
    .in("id", request.targetConnectionIds)
    .eq("user_id", userId)
    .eq("workspace_id", request.workspaceId);
  if (connError) throw connError;
  const targets = (rows ?? []) as unknown as TargetRow[];
  const byId = new Map(targets.map((t) => [t.id, t]));

  const problems: TargetProblem[] = [];
  for (const id of request.targetConnectionIds) {
    const target = byId.get(id);
    if (!target) {
      problems.push({
        connectionId: id,
        platform: null,
        code: "connection_missing",
        message: "That account is not connected in this workspace.",
      });
    } else if (target.status !== "active") {
      problems.push({
        connectionId: id,
        platform: target.platform,
        code: "connection_inactive",
        message: `Reconnect ${target.platform_account_name ?? target.platform} before posting to it.`,
      });
    }
  }
  if (problems.length > 0) return { kind: "bad_targets", problems };

  const platforms = Array.from(new Set(targets.map((t) => t.platform)));
  const captionFor = (platform: Platform) =>
    request.platformOverrides[platform]?.caption ?? request.caption;

  // 3. plan
  const snapshot = await getEntitlementSnapshot(supabase, userId, request.workspaceId);
  const immediate = request.scheduledFor === null;
  const denials: PlanProblem[] = [];
  for (const platform of platforms) {
    const decision = canUserDo(snapshot, {
      type: "publish_post",
      platform,
      hasExternalLink: containsExternalLink(captionFor(platform)),
    });
    if (decision.allowed) continue;
    if (!immediate && TIME_BASED.has(decision.code)) continue;
    denials.push({ platform, code: decision.code, message: decision.reason });
  }
  if (denials.length > 0) return { kind: "plan_denied", problems: denials };

  // 4. adapters
  const specs = listContentSpecs();
  for (const target of targets) {
    if (specs[target.platform]) continue;
    problems.push({
      connectionId: target.id,
      platform: target.platform,
      code: "adapter_missing",
      message: `${target.platform} publishing is not available yet.`,
    });
  }
  if (problems.length > 0) return { kind: "bad_targets", problems };

  // 5. content, per distinct platform, with overrides applied — and the
  //    platform's own publish options (TikTok's privacy level etc.), judged
  //    by the adapter so the rule lives in its file.
  const hasVideo = request.media.some((m) => m.type === "video");
  const issues: ContentIssue[] = platforms.flatMap((platform) => {
    const content = validateContent(specs[platform] as PlatformContentSpec, {
      caption: captionFor(platform),
      media: request.media,
    });
    const adapter = getPlatform(platform);
    const options = adapter.validateOptions
      ? adapter.validateOptions(request.platformOverrides[platform]?.options, null, { hasVideo })
      : [];
    return [
      ...content,
      ...options.map((message) => ({ platform, code: "invalid_options" as const, message })),
    ];
  });
  if (issues.length > 0) return { kind: "invalid_content", issues };

  // 6. the row. Publish-now is born `publishing` (claimed by this request);
  //    a scheduled post is born `scheduled` for the timer to claim.
  const { data: inserted, error: insertError } = await supabase
    .from("scheduled_posts")
    .insert({
      user_id: userId,
      workspace_id: request.workspaceId,
      caption: request.caption,
      media: request.media,
      platform_overrides: request.platformOverrides,
      target_connection_ids: request.targetConnectionIds,
      status: immediate ? "publishing" : "scheduled",
      scheduled_for: request.scheduledFor?.toISOString() ?? null,
      attempt_count: immediate ? 1 : 0,
    })
    .select(POST_COLUMNS)
    .single();
  if (insertError) throw insertError;
  const post = toPostRow(inserted as unknown as Record<string, unknown>);

  if (!immediate) return { kind: "scheduled", post };

  const report = await publishPost({ store: createPublishStore(supabase) }, post);
  return {
    kind: "published",
    post: { ...post, status: report.status },
    status: report.status,
    results: report.targets,
  };
}
