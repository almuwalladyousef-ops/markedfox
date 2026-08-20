"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/session";
import { getFreshConnectionTokens, listConnections } from "@/lib/connections/store";
import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import { createClient } from "@/lib/supabase/server";
import { recordUsage } from "@/lib/usage/record";
import { getActiveWorkspace } from "@/lib/workspaces/store";

import { parseBreakdown, type Breakdown } from "./breakdown";
import {
  buildAuditPrompt,
  buildBreakdownPrompt,
  buildHookPrompt,
} from "./breakdown-prompt";
import {
  GenerationError,
  generate,
  generateFromPrompt,
  type ScriptKind,
} from "./generate";
import { parseYouTubeVideoId } from "./links";
import { getResearchProvider, isResearchProviderConfigured } from "./providers";
import {
  createProject,
  createSyncStore,
  deleteProject,
  deleteSource,
  getBreakdown,
  getSource,
  getTranscript,
  getVideo,
  listFeed,
  removeProjectItem,
  saveBreakdown,
  saveLinkTranscript,
  saveScript,
  saveToProject,
  saveTranscript,
  setProjectItemStage,
  toBreakdown,
  toStoredSource,
  upsertSource,
} from "./store";
import { syncSource } from "./sync";
import {
  RESEARCH_PLATFORMS,
  ResearchProviderError,
  type ProviderContext,
  type ResearchPlatform,
} from "./types";

// Research's server actions. Every one runs through the user's own client, so
// RLS decides what is theirs, and every one checks the plan before spending
// anything the plan meters.

export type ResearchFormState = { message?: string; ok?: boolean };

const UUID = /^[0-9a-f-]{36}$/i;

function isResearchPlatform(value: string): value is ResearchPlatform {
  return (RESEARCH_PLATFORMS as readonly string[]).includes(value);
}

/**
 * Providers that read through a connected account need one. Picks the first
 * healthy connection on the matching platform in this workspace.
 */
async function connectionContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  platform: ResearchPlatform,
): Promise<{ connectionId: string; ctx: ProviderContext }> {
  const connections = await listConnections(supabase, workspaceId);
  const match = connections.find(
    (c) => c.platform === platform && c.status === "active",
  );
  if (!match) {
    throw new ResearchProviderError(
      `Connect a ${platform} account in this workspace first — research reads through it.`,
      "needs_connection",
    );
  }
  const { row, tokens } = await getFreshConnectionTokens(supabase, match.id);
  return {
    connectionId: match.id,
    ctx: {
      accessToken: tokens.accessToken,
      platformAccountId: row.platform_account_id,
    },
  };
}

export async function addSourceAction(
  _previous: ResearchFormState,
  formData: FormData,
): Promise<ResearchFormState> {
  const user = await requireUser();
  const active = await getActiveWorkspace();
  if (!active) return { message: "No workspace is selected." };

  const platform = String(formData.get("platform") ?? "");
  const input = String(formData.get("query") ?? "").trim();
  if (!isResearchPlatform(platform)) return { message: "Pick a platform." };
  if (!input) return { message: "Enter a channel, handle, or URL." };

  const supabase = await createClient();

  // Research is a Studio feature. Checked here, not only in the UI — the
  // Phase 2 rule is that a plan-locked capability is refused by the API.
  const snapshot = await getEntitlementSnapshot(supabase, user.id, active.id);
  // Two gates: research at all, and one more tracked channel. The second is
  // real cost — every channel is API quota spent on a schedule forever.
  const decision = canUserDo(snapshot, { type: "track_research_source" });
  if (!decision.allowed) return { message: decision.reason };

  const provider = getResearchProvider(platform);
  if (!isResearchProviderConfigured(provider)) {
    return {
      message: `${provider.label} research is not configured on this deployment yet.`,
    };
  }

  try {
    let connectionId: string | null = null;
    let ctx: ProviderContext = {};
    if (provider.capabilities.requiresConnection) {
      const resolved = await connectionContext(supabase, active.id, platform);
      connectionId = resolved.connectionId;
      ctx = resolved.ctx;
    }

    const identity = await provider.resolveSource(input, ctx);
    const row = await upsertSource(supabase, {
      userId: user.id,
      workspaceId: active.id,
      platform,
      externalId: identity.externalId,
      handle: identity.handle,
      title: identity.title,
      thumbnailUrl: identity.thumbnailUrl,
      followerCount: identity.followerCount,
      connectionId,
    });

    // Sync straight away: an empty feed after adding a channel reads as broken.
    await syncSource(toStoredSource(row), createSyncStore(supabase));
  } catch (error) {
    if (error instanceof ResearchProviderError) return { message: error.message };
    return { message: `Could not add that source: ${(error as Error).message}` };
  }

  revalidatePath("/dashboard/research");
  return { ok: true, message: "Added and synced." };
}

export async function syncSourceAction(formData: FormData): Promise<void> {
  await requireUser();
  const sourceId = String(formData.get("source_id") ?? "");
  if (!UUID.test(sourceId)) return;

  const supabase = await createClient();
  const row = await getSource(supabase, sourceId);
  if (!row) return;

  await syncSource(toStoredSource(row), createSyncStore(supabase));
  revalidatePath("/dashboard/research");
}

export async function deleteSourceAction(formData: FormData): Promise<void> {
  await requireUser();
  const sourceId = String(formData.get("source_id") ?? "");
  if (!UUID.test(sourceId)) return;

  const supabase = await createClient();
  await deleteSource(supabase, sourceId);
  revalidatePath("/dashboard/research");
}

/** Pull a transcript on demand. Free — no model runs, so no credit is spent. */
export async function fetchTranscriptAction(
  formData: FormData,
): Promise<void> {
  const user = await requireUser();
  const videoId = String(formData.get("video_id") ?? "");
  if (!UUID.test(videoId)) return;

  const supabase = await createClient();
  const video = await getVideo(supabase, videoId);
  if (!video) return;

  const source = await getSource(supabase, video.source_id);
  if (!source) return;

  const provider = getResearchProvider(source.platform);
  if (!provider.capabilities.transcripts || !provider.fetchTranscript) return;

  const result = await provider.fetchTranscript({
    externalId: video.external_id,
    url: video.url,
  });
  await saveTranscript(supabase, {
    videoId,
    userId: user.id,
    workspaceId: video.workspace_id,
    text: result.text,
    language: result.language,
    origin: result.origin,
  });

  revalidatePath(`/dashboard/research/${videoId}`);
}

const KINDS: ScriptKind[] = ["hooks", "outline", "script"];

export async function generateScriptAction(
  _previous: ResearchFormState,
  formData: FormData,
): Promise<ResearchFormState> {
  const user = await requireUser();
  const active = await getActiveWorkspace();
  if (!active) return { message: "No workspace is selected." };

  const kindRaw = String(formData.get("kind") ?? "hooks");
  const kind = (KINDS as string[]).includes(kindRaw)
    ? (kindRaw as ScriptKind)
    : "hooks";
  const topic = String(formData.get("topic") ?? "").trim() || null;
  const videoId = String(formData.get("video_id") ?? "");

  const supabase = await createClient();

  // One generation = one credit, checked BEFORE the model runs so a refusal
  // costs nothing upstream.
  const snapshot = await getEntitlementSnapshot(supabase, user.id, active.id);
  const decision = canUserDo(snapshot, {
    type: "spend_research_credits",
    credits: 1,
  });
  if (!decision.allowed) return { message: decision.reason };

  let sourceForPrompt = null as null | {
    title: string;
    platform: string;
    url: string | null;
    description: string | null;
    transcript: string | null;
    outlierScore: number | null;
    breakdown: Breakdown | null;
  };
  let usedBreakdown = false;

  if (UUID.test(videoId)) {
    const video = await getVideo(supabase, videoId);
    if (video) {
      const sourceRow = await getSource(supabase, video.source_id);
      // The breakdown is preferred over the transcript, and it is not a
      // preference of style: passing the mechanism WITHOUT the original words
      // is what makes the output a remix instead of a paraphrase.
      const breakdownRow = await getBreakdown(supabase, videoId);
      const breakdown = breakdownRow ? toBreakdown(breakdownRow) : null;
      usedBreakdown = breakdown !== null;
      const transcript = breakdown ? null : await getTranscript(supabase, videoId);
      sourceForPrompt = {
        title: video.title,
        platform: sourceRow?.platform ?? "unknown",
        url: video.url,
        description: video.description,
        transcript:
          transcript && transcript.origin === "captions" ? transcript.text : null,
        outlierScore:
          video.outlier_score === null ? null : Number(video.outlier_score),
        breakdown,
      };
    }
  }

  try {
    const result = await generate({ kind, topic, source: sourceForPrompt });

    await saveScript(supabase, {
      userId: user.id,
      workspaceId: active.id,
      videoId: UUID.test(videoId) ? videoId : null,
      kind,
      topic,
      output: result.output,
      model: result.model,
      creditsSpent: 1,
      fromBreakdown: usedBreakdown,
    });

    // Recorded AFTER the call, because the credit is only spent if the model
    // actually answered. A failed call must not bill the user.
    await recordUsage(supabase, {
      userId: user.id,
      workspaceId: active.id,
      kind: "ai_call",
      amount: 1,
      metadata: { feature: "research", kind, model: result.model },
    });
  } catch (error) {
    if (error instanceof GenerationError) {
      if (error.code === "not_configured") {
        return {
          message:
            "AI generation is not configured on this deployment yet — no credit was used.",
        };
      }
      return { message: `${error.message} — no credit was used.` };
    }
    return {
      message: `Generation failed: ${(error as Error).message} — no credit was used.`,
    };
  }

  revalidatePath("/dashboard/research");
  if (UUID.test(videoId)) revalidatePath(`/dashboard/research/${videoId}`);
  return { ok: true, message: "Generated." };
}

// ── step 3: the breakdown ──────────────────────────────────────────────────

/**
 * Deconstruct one video. Costs a credit, because it is a model call — and it
 * is the call that makes the next one worth making, so it is charged the same
 * as any other generation rather than bundled invisibly.
 */
export async function breakdownVideoAction(
  _previous: ResearchFormState,
  formData: FormData,
): Promise<ResearchFormState> {
  const user = await requireUser();
  const active = await getActiveWorkspace();
  if (!active) return { message: "No workspace is selected." };

  const videoId = String(formData.get("video_id") ?? "");
  if (!UUID.test(videoId)) return { message: "Unknown video." };

  const supabase = await createClient();
  const snapshot = await getEntitlementSnapshot(supabase, user.id, active.id);
  const decision = canUserDo(snapshot, {
    type: "spend_research_credits",
    credits: 1,
  });
  if (!decision.allowed) return { message: decision.reason };

  const video = await getVideo(supabase, videoId);
  if (!video) return { message: "Unknown video." };
  const source = await getSource(supabase, video.source_id);
  const transcript = await getTranscript(supabase, videoId);

  try {
    const prompt = buildBreakdownPrompt({
      title: video.title,
      platform: source?.platform ?? "unknown",
      description: video.description,
      transcript:
        transcript && transcript.origin === "captions" ? transcript.text : null,
      outlierScore:
        video.outlier_score === null ? null : Number(video.outlier_score),
      durationSeconds: video.duration_seconds,
    });

    const result = await generateFromPrompt(prompt);
    const breakdown = parseBreakdown(result.output);
    if (!breakdown) {
      // The model answered but not usably. No credit is recorded — the user
      // got nothing, so they are charged nothing.
      return {
        message:
          "The model's answer could not be read as a breakdown. Try again — no credit was used.",
      };
    }

    await saveBreakdown(supabase, {
      videoId,
      userId: user.id,
      workspaceId: video.workspace_id,
      breakdown,
      model: result.model,
    });

    await recordUsage(supabase, {
      userId: user.id,
      workspaceId: active.id,
      kind: "ai_call",
      amount: 1,
      refId: videoId,
      metadata: { feature: "research", kind: "breakdown", model: result.model },
    });
  } catch (error) {
    if (error instanceof GenerationError) {
      return error.code === "not_configured"
        ? {
            message:
              "AI is not configured on this deployment yet — no credit was used.",
          }
        : { message: `${error.message} — no credit was used.` };
    }
    return {
      message: `Breakdown failed: ${(error as Error).message} — no credit was used.`,
    };
  }

  revalidatePath(`/dashboard/research/${videoId}`);
  return { ok: true, message: "Broken down." };
}

// ── standalone tools ───────────────────────────────────────────────────────

/** The hook generator, with no source video: a topic in, many hooks out. */
export async function generateHooksAction(
  _previous: ResearchFormState,
  formData: FormData,
): Promise<ResearchFormState> {
  const user = await requireUser();
  const active = await getActiveWorkspace();
  if (!active) return { message: "No workspace is selected." };

  const topic = String(formData.get("topic") ?? "").trim();
  if (!topic) return { message: "Enter a topic." };

  const supabase = await createClient();
  const snapshot = await getEntitlementSnapshot(supabase, user.id, active.id);
  const decision = canUserDo(snapshot, {
    type: "spend_research_credits",
    credits: 1,
  });
  if (!decision.allowed) return { message: decision.reason };

  // Optionally anchored to a video's breakdown, which is what makes these
  // hooks patterned rather than generic.
  const videoId = String(formData.get("video_id") ?? "");
  let breakdown: Breakdown | null = null;
  if (UUID.test(videoId)) {
    const row = await getBreakdown(supabase, videoId);
    if (row) breakdown = toBreakdown(row);
  }

  try {
    const result = await generateFromPrompt(
      buildHookPrompt({ topic, count: 20, breakdown }),
    );
    await saveScript(supabase, {
      userId: user.id,
      workspaceId: active.id,
      videoId: UUID.test(videoId) ? videoId : null,
      kind: "hooks",
      topic,
      output: result.output,
      model: result.model,
      creditsSpent: 1,
    });
    await recordUsage(supabase, {
      userId: user.id,
      workspaceId: active.id,
      kind: "ai_call",
      amount: 1,
      metadata: { feature: "research", kind: "hooks", model: result.model },
    });
  } catch (error) {
    if (error instanceof GenerationError) {
      return error.code === "not_configured"
        ? { message: "AI is not configured on this deployment yet — no credit was used." }
        : { message: `${error.message} — no credit was used.` };
    }
    return { message: `Generation failed: ${(error as Error).message} — no credit was used.` };
  }

  revalidatePath("/dashboard/research/tools");
  return { ok: true, message: "Generated." };
}

/** The transcript downloader: any link, not only a tracked video. Free. */
export async function transcribeLinkAction(
  _previous: ResearchFormState,
  formData: FormData,
): Promise<ResearchFormState> {
  const user = await requireUser();
  const active = await getActiveWorkspace();
  if (!active) return { message: "No workspace is selected." };

  const url = String(formData.get("url") ?? "").trim();
  if (!url) return { message: "Paste a video link." };

  const supabase = await createClient();
  const snapshot = await getEntitlementSnapshot(supabase, user.id, active.id);
  const decision = canUserDo(snapshot, { type: "use_research" });
  if (!decision.allowed) return { message: decision.reason };

  // Only YouTube serves transcripts through an API today; the others are
  // refused with the reason rather than silently returning nothing.
  const videoId = parseYouTubeVideoId(url);
  if (!videoId) {
    return {
      message:
        "Only YouTube links can be transcribed today — YouTube is the one platform that serves captions through an API.",
    };
  }

  const provider = getResearchProvider("youtube");
  if (!provider.fetchTranscript) {
    return { message: "Transcripts are not available on this deployment." };
  }

  try {
    const result = await provider.fetchTranscript({
      externalId: videoId,
      url,
    });
    if (result.origin === "unavailable") {
      return {
        message:
          "That video has no captions to pull. Nothing was charged — transcripts are free.",
      };
    }
    await saveLinkTranscript(supabase, {
      userId: user.id,
      workspaceId: active.id,
      platform: "youtube",
      externalId: videoId,
      url,
      title: null,
      text: result.text,
      language: result.language,
      origin: result.origin,
    });
  } catch (error) {
    return { message: `Could not fetch that transcript: ${(error as Error).message}` };
  }

  revalidatePath("/dashboard/research/tools");
  return { ok: true, message: "Transcript saved." };
}


/**
 * The personal audit: the user's own channel, judged against itself.
 *
 * Runs on a source they already track, which is deliberate — auditing an
 * account means having its history, and the history is what tracking builds.
 */
export async function auditChannelAction(
  _previous: ResearchFormState,
  formData: FormData,
): Promise<ResearchFormState> {
  const user = await requireUser();
  const active = await getActiveWorkspace();
  if (!active) return { message: "No workspace is selected." };

  const sourceId = String(formData.get("source_id") ?? "");
  if (!UUID.test(sourceId)) return { message: "Pick a channel." };

  const supabase = await createClient();
  const snapshot = await getEntitlementSnapshot(supabase, user.id, active.id);
  const decision = canUserDo(snapshot, {
    type: "spend_research_credits",
    credits: 1,
  });
  if (!decision.allowed) return { message: decision.reason };

  const source = await getSource(supabase, sourceId);
  if (!source) return { message: "Unknown channel." };

  const videos = await listFeed(supabase, active.id, { sourceId, limit: 100 });
  if (videos.length < 5) {
    return {
      message:
        "Not enough videos yet to audit this channel — sync it again once it has a few more.",
    };
  }

  const scored = videos
    .filter((v) => v.outlier_score !== null)
    .sort((a, b) => Number(b.outlier_score) - Number(a.outlier_score));

  try {
    const result = await generateFromPrompt(
      buildAuditPrompt({
        channelTitle: source.title,
        platform: source.platform,
        baselineViews: source.baseline_views,
        sample: source.baseline_sample,
        top: scored.slice(0, 8).map((v) => ({
          title: v.title,
          score: v.outlier_score === null ? null : Number(v.outlier_score),
        })),
        bottom: scored.slice(-5).map((v) => ({
          title: v.title,
          score: v.outlier_score === null ? null : Number(v.outlier_score),
        })),
      }),
    );

    await saveScript(supabase, {
      userId: user.id,
      workspaceId: active.id,
      videoId: null,
      kind: "audit",
      topic: source.title,
      output: result.output,
      model: result.model,
      creditsSpent: 1,
    });
    await recordUsage(supabase, {
      userId: user.id,
      workspaceId: active.id,
      kind: "ai_call",
      amount: 1,
      refId: sourceId,
      metadata: { feature: "research", kind: "audit", model: result.model },
    });
  } catch (error) {
    if (error instanceof GenerationError) {
      return error.code === "not_configured"
        ? { message: "AI is not configured on this deployment yet — no credit was used." }
        : { message: `${error.message} — no credit was used.` };
    }
    return { message: `Audit failed: ${(error as Error).message} — no credit was used.` };
  }

  revalidatePath("/dashboard/research/tools");
  return { ok: true, message: "Audit ready." };
}

// ── projects: the pipeline ─────────────────────────────────────────────────

export async function createProjectAction(
  _previous: ResearchFormState,
  formData: FormData,
): Promise<ResearchFormState> {
  const user = await requireUser();
  const active = await getActiveWorkspace();
  if (!active) return { message: "No workspace is selected." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { message: "Name the project." };

  const supabase = await createClient();
  const decision = canUserDo(
    await getEntitlementSnapshot(supabase, user.id, active.id),
    { type: "use_research" },
  );
  if (!decision.allowed) return { message: decision.reason };

  await createProject(supabase, {
    userId: user.id,
    workspaceId: active.id,
    name: name.slice(0, 120),
    description: String(formData.get("description") ?? "").trim().slice(0, 500) || null,
  });

  revalidatePath("/dashboard/research/projects");
  return { ok: true, message: "Project created." };
}

export async function saveToProjectAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const active = await getActiveWorkspace();
  if (!active) return;

  const projectId = String(formData.get("project_id") ?? "");
  const videoId = String(formData.get("video_id") ?? "");
  if (!UUID.test(projectId) || !UUID.test(videoId)) return;

  const supabase = await createClient();
  await saveToProject(supabase, {
    userId: user.id,
    workspaceId: active.id,
    projectId,
    videoId,
  });

  revalidatePath(`/dashboard/research/projects/${projectId}`);
  revalidatePath(`/dashboard/research/${videoId}`);
}

export async function setStageAction(formData: FormData): Promise<void> {
  await requireUser();
  const itemId = String(formData.get("item_id") ?? "");
  const stage = String(formData.get("stage") ?? "");
  const allowed = ["saved", "scripted", "filmed", "published", "dropped"];
  if (!UUID.test(itemId) || !allowed.includes(stage)) return;

  const supabase = await createClient();
  await setProjectItemStage(supabase, itemId, stage);
  revalidatePath("/dashboard/research/projects");
}

export async function removeProjectItemAction(formData: FormData): Promise<void> {
  await requireUser();
  const itemId = String(formData.get("item_id") ?? "");
  if (!UUID.test(itemId)) return;

  const supabase = await createClient();
  await removeProjectItem(supabase, itemId);
  revalidatePath("/dashboard/research/projects");
}

export async function deleteProjectAction(formData: FormData): Promise<void> {
  await requireUser();
  const projectId = String(formData.get("project_id") ?? "");
  if (!UUID.test(projectId)) return;

  const supabase = await createClient();
  await deleteProject(supabase, projectId);
  revalidatePath("/dashboard/research/projects");
}
