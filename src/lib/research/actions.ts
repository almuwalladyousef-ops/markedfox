"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/session";
import { getFreshConnectionTokens, listConnections } from "@/lib/connections/store";
import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import { createClient } from "@/lib/supabase/server";
import { recordUsage } from "@/lib/usage/record";
import { getActiveWorkspace } from "@/lib/workspaces/store";

import { GenerationError, generate, type ScriptKind } from "./generate";
import { getResearchProvider, isResearchProviderConfigured } from "./providers";
import {
  createSyncStore,
  deleteSource,
  getSource,
  getTranscript,
  getVideo,
  saveScript,
  saveTranscript,
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
  const decision = canUserDo(snapshot, { type: "use_research" });
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
  };

  if (UUID.test(videoId)) {
    const video = await getVideo(supabase, videoId);
    if (video) {
      const sourceRow = await getSource(supabase, video.source_id);
      const transcript = await getTranscript(supabase, videoId);
      sourceForPrompt = {
        title: video.title,
        platform: sourceRow?.platform ?? "unknown",
        url: video.url,
        description: video.description,
        transcript:
          transcript && transcript.origin === "captions" ? transcript.text : null,
        outlierScore: video.outlier_score,
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
