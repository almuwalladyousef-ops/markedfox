"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/store";

import { getFreshConnectionTokens, listConnections } from "@/lib/connections/store";

import { buildHookPrompt, renderBreakdownForPrompt } from "./breakdown-prompt";
import {
  annotateResearchCredit,
  releaseResearchCredit,
  reserveResearchCredit,
  type CreditReservation,
} from "./credits";
import {
  buildChannelSuggestionPrompt,
  matchesSizeTiers,
  parseChannelSuggestions,
  parsePastedChannels,
  parsePickedChannel,
  SIZE_TIERS,
  type ChannelCandidate,
  type PickedChannel,
  type SizeTierId,
} from "./discover";
import { getResearchProvider } from "./providers";
import { GenerationError, generateFromPrompt } from "./generate";
import {
  createSyncStore,
  getBreakdown,
  getVideo,
  listSources,
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
import {
  createScriptDraft,
  deleteAutomation,
  deleteHookTemplate,
  deleteSavedFilter,
  deleteScriptDraft,
  discardAllInbox,
  getHookTemplates,
  getIdeaForVideo,
  getPersona,
  getScriptDraft,
  saveFilter,
  saveHookTemplate,
  savePersona,
  setIdeaNote,
  setIdeaStatus,
  toggleHookFavorite,
  updateScriptDraft,
  upsertAutomation,
  upsertIdea,
  MAX_HOOK_OPTIONS,
  type HookOption,
  type IdeaStatus,
  type ScriptStage,
} from "./studio-store";
import { personaLine } from "./studio-types";

// Server actions for the research studio. Same contract as actions.ts: the
// user's own client so RLS scopes every read and write, `canUserDo` before
// anything the plan meters, and a usage row only once the work actually
// happened.

export type StudioFormState = { message?: string; ok?: boolean };

const UUID = /^[0-9a-f-]{36}$/i;

async function context() {
  const user = await requireUser();
  const active = await getActiveWorkspace();
  if (!active) return null;
  const supabase = await createClient();
  return { user, active, supabase };
}

function num(form: FormData, name: string, fallback: number): number {
  const raw = form.get(name);
  if (raw === null || raw === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(form: FormData, name: string, max = 2000): string | null {
  const raw = form.get(name);
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

// ── ideas ──────────────────────────────────────────────────────────────────

export async function shortlistVideoAction(formData: FormData): Promise<void> {
  const ctx = await context();
  if (!ctx) return;
  const videoId = String(formData.get("video_id") ?? "");
  if (!UUID.test(videoId)) return;

  const video = await getVideo(ctx.supabase, videoId);
  if (!video) return;
  const breakdownRow = await getBreakdown(ctx.supabase, videoId);
  const breakdown = breakdownRow ? toBreakdown(breakdownRow) : null;

  // The idea's title is the ANGLE where one exists, not the source video's
  // title. A queue full of other people's headlines is a queue of other
  // people's videos; a queue of angles is a queue of things to make.
  const id = await upsertIdea(ctx.supabase, {
    userId: ctx.user.id,
    workspaceId: ctx.active.id,
    videoId,
    title: breakdown?.ideaSeed ?? breakdown?.uniqueAngle ?? video.title,
    summary: breakdown?.summary ?? breakdown?.takeaway ?? null,
  });
  await setIdeaStatus(ctx.supabase, id, "shortlisted");

  revalidatePath("/dashboard/research/ideas");
  revalidatePath(`/dashboard/research/${videoId}`);
}

/**
 * Keep a video, without deciding anything about it yet.
 *
 * Toggles: pressing Save on something already saved puts it back in the inbox,
 * because a save button that cannot be undone is a button people stop pressing.
 * It deliberately does NOT touch a shortlisted or discarded row — those are
 * later judgements, and quietly demoting one to "saved" would lose a decision
 * the user made on purpose.
 */
export async function saveVideoAction(formData: FormData): Promise<void> {
  const ctx = await context();
  if (!ctx) return;
  const videoId = String(formData.get("video_id") ?? "");
  if (!UUID.test(videoId)) return;

  const video = await getVideo(ctx.supabase, videoId);
  if (!video) return;

  const existing = await getIdeaForVideo(ctx.supabase, ctx.active.id, videoId);
  if (existing && existing.status !== "inbox" && existing.status !== "saved") {
    return;
  }

  const breakdownRow = await getBreakdown(ctx.supabase, videoId);
  const breakdown = breakdownRow ? toBreakdown(breakdownRow) : null;

  const id = await upsertIdea(ctx.supabase, {
    userId: ctx.user.id,
    workspaceId: ctx.active.id,
    videoId,
    title: breakdown?.ideaSeed ?? breakdown?.uniqueAngle ?? video.title,
    summary: breakdown?.summary ?? breakdown?.takeaway ?? null,
  });
  await setIdeaStatus(
    ctx.supabase,
    id,
    existing?.status === "saved" ? "inbox" : "saved",
  );

  revalidatePath("/dashboard/research");
  revalidatePath("/dashboard/research/ideas");
  revalidatePath(`/dashboard/research/${videoId}`);
}

export async function setIdeaStatusAction(formData: FormData): Promise<void> {
  const ctx = await context();
  if (!ctx) return;
  const id = String(formData.get("idea_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!UUID.test(id)) return;
  if (!["inbox", "saved", "shortlisted", "discarded"].includes(status)) return;

  await setIdeaStatus(ctx.supabase, id, status as IdeaStatus);
  revalidatePath("/dashboard/research/ideas");
}

export async function setIdeaNoteAction(
  _previous: StudioFormState,
  formData: FormData,
): Promise<StudioFormState> {
  const ctx = await context();
  if (!ctx) return { message: "No workspace is selected." };
  const id = String(formData.get("idea_id") ?? "");
  if (!UUID.test(id)) return { message: "Unknown idea." };

  await setIdeaNote(ctx.supabase, id, text(formData, "note", 4000));
  revalidatePath("/dashboard/research/ideas");
  return { ok: true, message: "Saved." };
}

export async function discardAllInboxAction(): Promise<void> {
  const ctx = await context();
  if (!ctx) return;
  await discardAllInbox(ctx.supabase, ctx.active.id);
  revalidatePath("/dashboard/research/ideas");
}

// ── hook vault ─────────────────────────────────────────────────────────────

export async function saveHookAction(formData: FormData): Promise<void> {
  const ctx = await context();
  if (!ctx) return;

  const videoId = String(formData.get("video_id") ?? "");
  const formula = text(formData, "formula", 400);
  if (!formula) return;

  await saveHookTemplate(ctx.supabase, {
    userId: ctx.user.id,
    workspaceId: ctx.active.id,
    videoId: UUID.test(videoId) ? videoId : null,
    formula,
    example: text(formData, "example", 400),
    category: text(formData, "category", 80),
    sourceHandle: text(formData, "source_handle", 120),
    sourceViews: formData.get("source_views")
      ? num(formData, "source_views", 0)
      : null,
  });

  revalidatePath("/dashboard/research/hooks");
  if (UUID.test(videoId)) revalidatePath(`/dashboard/research/${videoId}`);
}

export async function toggleHookFavoriteAction(
  formData: FormData,
): Promise<void> {
  const ctx = await context();
  if (!ctx) return;
  const id = String(formData.get("hook_id") ?? "");
  if (!UUID.test(id)) return;
  await toggleHookFavorite(ctx.supabase, id, formData.get("favorite") === "1");
  revalidatePath("/dashboard/research/hooks");
}

export async function deleteHookAction(formData: FormData): Promise<void> {
  const ctx = await context();
  if (!ctx) return;
  const id = String(formData.get("hook_id") ?? "");
  if (!UUID.test(id)) return;
  await deleteHookTemplate(ctx.supabase, id);
  revalidatePath("/dashboard/research/hooks");
}

// ── auto-analyze rules ─────────────────────────────────────────────────────

export async function saveAutomationAction(
  _previous: StudioFormState,
  formData: FormData,
): Promise<StudioFormState> {
  const ctx = await context();
  if (!ctx) return { message: "No workspace is selected." };

  const snapshot = await getEntitlementSnapshot(
    ctx.supabase,
    ctx.user.id,
    ctx.active.id,
  );
  const decision = canUserDo(snapshot, { type: "use_research" });
  if (!decision.allowed) return { message: decision.reason };

  const name = text(formData, "name", 80);
  if (!name) return { message: "Give the rule a name." };

  const sourceId = String(formData.get("source_id") ?? "");
  const id = String(formData.get("id") ?? "");

  // The daily limit is the guard that matters: every analysis this rule runs
  // spends a credit, so an unbounded rule is an unbounded bill.
  const dailyLimit = Math.min(Math.max(Math.round(num(formData, "daily_limit", 5)), 1), 50);

  await upsertAutomation(ctx.supabase, {
    id: UUID.test(id) ? id : undefined,
    userId: ctx.user.id,
    workspaceId: ctx.active.id,
    name,
    sourceId: UUID.test(sourceId) ? sourceId : null,
    minOutlierScore: Math.max(0, num(formData, "min_outlier_score", 2)),
    minViews: Math.max(0, Math.round(num(formData, "min_views", 0))),
    // The form asks for a percentage because that is what the feed shows;
    // the column stores a fraction because that is what it compares against.
    minEngagementRate: Math.max(0, num(formData, "min_engagement_rate", 0)) / 100,
    dailyLimit,
    active: formData.get("active") === "on" || formData.get("active") === "1",
  });

  revalidatePath("/dashboard/research/rules");
  return { ok: true, message: "Saved." };
}

export async function deleteAutomationAction(formData: FormData): Promise<void> {
  const ctx = await context();
  if (!ctx) return;
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return;
  await deleteAutomation(ctx.supabase, id);
  revalidatePath("/dashboard/research/rules");
}

// ── saved filters ──────────────────────────────────────────────────────────

export async function saveFilterAction(formData: FormData): Promise<void> {
  const ctx = await context();
  if (!ctx) return;
  const name = text(formData, "name", 60);
  if (!name) return;

  // Everything except the name is the filter. Stored as key → list of values,
  // because the controls that matter most are multi-value: the channel picker
  // emits one `source` per channel and Status emits one per box. Collapsing
  // those to a single value meant a filter saved with six channels reloaded
  // with one, and a filter saved with both status boxes ticked reloaded as
  // analyzed-only — silently the wrong filter.
  const filters: Record<string, string[]> = {};
  for (const [key, value] of formData.entries()) {
    if (key === "name" || typeof value !== "string" || !value) continue;
    const bucket = filters[key] ?? (filters[key] = []);
    if (bucket.length < 60) bucket.push(value.slice(0, 200));
  }

  await saveFilter(ctx.supabase, {
    userId: ctx.user.id,
    workspaceId: ctx.active.id,
    name,
    filters,
  });
  revalidatePath("/dashboard/research");
}

export async function deleteSavedFilterAction(
  formData: FormData,
): Promise<void> {
  const ctx = await context();
  if (!ctx) return;
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return;
  await deleteSavedFilter(ctx.supabase, id);
  revalidatePath("/dashboard/research");
}

// ── persona ────────────────────────────────────────────────────────────────

export async function savePersonaAction(
  _previous: StudioFormState,
  formData: FormData,
): Promise<StudioFormState> {
  const ctx = await context();
  if (!ctx) return { message: "No workspace is selected." };

  await savePersona(ctx.supabase, {
    userId: ctx.user.id,
    workspaceId: ctx.active.id,
    niche: text(formData, "niche", 300),
    audience: text(formData, "audience", 300),
    tone: text(formData, "tone", 300),
    avoid: text(formData, "avoid", 300),
  });

  revalidatePath("/dashboard/research/persona");
  return { ok: true, message: "Saved." };
}

// ── script drafts ──────────────────────────────────────────────────────────

export async function createScriptDraftAction(
  formData: FormData,
): Promise<void> {
  const ctx = await context();
  if (!ctx) return;

  const videoId = String(formData.get("video_id") ?? "");
  const ideaId = String(formData.get("idea_id") ?? "");
  const topic = text(formData, "topic", 500);

  const id = await createScriptDraft(ctx.supabase, {
    userId: ctx.user.id,
    workspaceId: ctx.active.id,
    title: topic?.slice(0, 60) ?? "New script",
    topic,
    videoId: UUID.test(videoId) ? videoId : null,
    ideaId: UUID.test(ideaId) ? ideaId : null,
  });

  redirect(`/dashboard/research/scripts/${id}`);
}

export async function deleteScriptDraftAction(
  formData: FormData,
): Promise<void> {
  const ctx = await context();
  if (!ctx) return;
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return;
  await deleteScriptDraft(ctx.supabase, id);
  redirect("/dashboard/research/scripts");
}

/**
 * Save one stage of a draft and move to the next.
 *
 * Stages are saved even when they are skipped, and moving forward never clears
 * what is behind: the whole reason the pipeline is stored rather than streamed
 * is that a person can walk back into the hook stage after seeing the script
 * and try a different one without losing the research.
 */
export async function saveScriptStageAction(
  _previous: StudioFormState,
  formData: FormData,
): Promise<StudioFormState> {
  const ctx = await context();
  if (!ctx) return { message: "No workspace is selected." };

  const id = String(formData.get("draft_id") ?? "");
  if (!UUID.test(id)) return { message: "Unknown draft." };
  const draft = await getScriptDraft(ctx.supabase, id);
  if (!draft) return { message: "Unknown draft." };

  const stage = String(formData.get("stage") ?? "") as ScriptStage;
  const patch: Parameters<typeof updateScriptDraft>[2] = {};

  if (stage === "topic") {
    const topic = text(formData, "topic", 1000);
    if (!topic) return { message: "Describe the topic first." };
    patch.topic = topic;
    patch.title = text(formData, "title", 80) ?? topic.slice(0, 60);
    patch.stage = "research";
  } else if (stage === "research") {
    patch.research_notes = text(formData, "research_notes", 8000);
    patch.stage = "hook";
  } else if (stage === "hook") {
    const chosen = text(formData, "chosen_hook", 400);
    if (!chosen) return { message: "Pick a hook, or write your own." };
    patch.chosen_hook = chosen;
    patch.stage = "style";
  } else if (stage === "style") {
    patch.style_notes = text(formData, "style_notes", 2000);
    patch.stage = "script";
  } else if (stage === "script") {
    patch.script = text(formData, "script", 20000);
  } else {
    return { message: "Unknown stage." };
  }

  await updateScriptDraft(ctx.supabase, id, patch);
  revalidatePath(`/dashboard/research/scripts/${id}`);
  return { ok: true, message: "Saved." };
}

/** Jump straight to a stage without saving — the "Jump to:" chips. */
export async function goToStageAction(formData: FormData): Promise<void> {
  const ctx = await context();
  if (!ctx) return;
  const id = String(formData.get("draft_id") ?? "");
  const stage = String(formData.get("stage") ?? "");
  if (!UUID.test(id)) return;
  if (!["topic", "research", "hook", "style", "script"].includes(stage)) return;
  await updateScriptDraft(ctx.supabase, id, { stage: stage as ScriptStage });
  revalidatePath(`/dashboard/research/scripts/${id}`);
}

// ── generation inside the pipeline ─────────────────────────────────────────

/**
 * Take a credit before calling a model, atomically.
 *
 * Reserving rather than checking-then-recording is what makes the cap exact:
 * two tabs, or one impatient double-click, used to read the same snapshot,
 * both pass, and both spend. The reservation IS the usage row, so it is
 * counted from the instant it exists — and released if the model never
 * answers, which is what keeps "no credit was used" true.
 */
async function reserveCredit(
  ctx: NonNullable<Awaited<ReturnType<typeof context>>>,
  kind: string,
  refId: string | null,
): Promise<
  { ok: true; reservation: CreditReservation } | { ok: false; reason: string }
> {
  const snapshot = await getEntitlementSnapshot(
    ctx.supabase,
    ctx.user.id,
    ctx.active.id,
  );
  // The structural check first — is research on this plan at all — because its
  // message says something useful that a bare "out of credits" would not.
  const allowed = canUserDo(snapshot, {
    type: "spend_research_credits",
    credits: 1,
  });
  if (!allowed.allowed) return { ok: false, reason: allowed.reason };

  const reservation = await reserveResearchCredit(ctx.supabase, {
    userId: ctx.user.id,
    workspaceId: ctx.active.id,
    monthlyLimit: snapshot.limits.researchCreditsPerMonth,
    refId,
    metadata: { feature: "research", kind },
  });
  if (!reservation) {
    return {
      ok: false,
      reason: `Research credits are capped at ${snapshot.limits.researchCreditsPerMonth} a month on the ${snapshot.planId} plan.`,
    };
  }
  return { ok: true, reservation };
}

/** The research stage: a briefing document on the topic. */
export async function generateResearchAction(
  _previous: StudioFormState,
  formData: FormData,
): Promise<StudioFormState> {
  const ctx = await context();
  if (!ctx) return { message: "No workspace is selected." };
  const id = String(formData.get("draft_id") ?? "");
  if (!UUID.test(id)) return { message: "Unknown draft." };
  const draft = await getScriptDraft(ctx.supabase, id);
  if (!draft?.topic) return { message: "Describe the topic first." };

  const held = await reserveCredit(ctx, "script_research", id);
  if (!held.ok) return { message: held.reason };

  const persona = await getPersona(ctx.supabase, ctx.active.id);
  const prompt = [
    "You brief a short-form video creator before they write a script.",
    "",
    "Write a research brief on the topic below. Plain text, no preamble, in four",
    "sections with these exact headings:",
    "Executive summary",
    "How to engage viewers",
    "Surprising facts",
    "What to avoid",
    "",
    "Rules:",
    "- Concrete over general. A fact with a number in it beats an observation.",
    "- Mark anything you are not certain of as unverified rather than stating it flatly.",
    "- No filler, no 'in today's fast-paced world'.",
    "",
    `Topic: ${draft.topic}`,
    personaLine(persona) ?? "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const result = await generateFromPrompt(prompt);
    await updateScriptDraft(ctx.supabase, id, {
      research_notes: result.output,
      stage: "research",
    });
    await annotateResearchCredit(ctx.supabase, ctx.user.id, held.reservation, {
      feature: "research",
      kind: "script_research",
      model: result.model,
    });
  } catch (error) {
    await releaseResearchCredit(ctx.supabase, ctx.user.id, held.reservation);
    return { message: generationMessage(error) };
  }

  revalidatePath(`/dashboard/research/scripts/${id}`);
  return { ok: true, message: "Research written." };
}

/**
 * The hook stage — the part that makes this worth using.
 *
 * Hooks are generated by applying patterns lifted from videos that already
 * beat their own channel, so each one arrives with the evidence behind it
 * attached. Without templates it falls back to the pattern list, which is
 * still useful but is a model's taste rather than a niche's data.
 */
export async function generateDraftHooksAction(
  _previous: StudioFormState,
  formData: FormData,
): Promise<StudioFormState> {
  const ctx = await context();
  if (!ctx) return { message: "No workspace is selected." };
  const id = String(formData.get("draft_id") ?? "");
  if (!UUID.test(id)) return { message: "Unknown draft." };
  const draft = await getScriptDraft(ctx.supabase, id);
  if (!draft?.topic) return { message: "Describe the topic first." };

  // Refused before the reservation, not after the call: generating hooks the
  // cap would then throw away is a credit spent on nothing.
  if ((draft.hook_options ?? []).length >= MAX_HOOK_OPTIONS) {
    return {
      message: `This script already has ${MAX_HOOK_OPTIONS} hooks. Pick one, or start another script — no credit was used.`,
    };
  }

  const held = await reserveCredit(ctx, "script_hooks", id);
  if (!held.ok) return { message: held.reason };

  const templateIds = formData.getAll("template_id").map(String).filter((v) => UUID.test(v));
  const templates = await getHookTemplates(ctx.supabase, templateIds);
  const persona = await getPersona(ctx.supabase, ctx.active.id);

  const prompt =
    templates.length > 0
      ? [
          "You write opening hooks for short-form video by filling proven patterns.",
          "",
          "Below are hook formulas taken from videos that beat their own channel's",
          "average, each with the account and view count that earned it. Write ONE",
          "hook per formula for the topic, keeping the formula's shape and replacing",
          "its bracketed parts with specifics from the topic.",
          "",
          "Rules:",
          "- One sentence each, spoken in under four seconds.",
          "- Keep the pattern's rhythm; do not smooth it into a generic sentence.",
          "- Do not reuse the original's subject matter.",
          "- Output one hook per line, numbered, nothing else.",
          "",
          `Topic: ${draft.topic}`,
          personaLine(persona) ?? "",
          "",
          "Formulas:",
          ...templates.map(
            (t, i) =>
              `${i + 1}. ${t.formula}${t.source_handle ? ` — from @${t.source_handle}` : ""}`,
          ),
        ]
          .filter(Boolean)
          .join("\n")
      : buildHookPrompt({ topic: draft.topic, count: 8 });

  try {
    const result = await generateFromPrompt(prompt);
    const lines = result.output
      .split("\n")
      .map((line) => line.replace(/^\s*\d+[.)]\s*/, "").trim())
      .filter((line) => line.length > 8)
      .slice(0, 12);

    // Line N came from formula N — the prompt asked for one per formula in
    // order — so the attribution survives without asking the model to repeat it
    // back and hoping it does.
    // Attribution is positional — the prompt asked for one hook per formula, in
    // order — which only holds when the counts match. A preamble line that
    // survived the filter shifts every hook one template to the left, and a
    // hook credited to the wrong creator is precisely what the vault exists to
    // prevent. When the shapes disagree, the hooks are still useful; the
    // evidence is not, so it is dropped rather than guessed at.
    const attributable = templates.length > 0 && lines.length === templates.length;
    const options: HookOption[] = lines.map((line, index) => {
      const template = attributable ? templates[index] : undefined;
      return {
        text: line,
        sourceHandle: template?.source_handle ?? undefined,
        sourceViews: template?.source_views ?? undefined,
      };
    });

    const existing = draft.hook_options ?? [];
    await updateScriptDraft(ctx.supabase, id, {
      hook_options: [...existing, ...options].slice(0, MAX_HOOK_OPTIONS),
      stage: "hook",
    });
    await annotateResearchCredit(ctx.supabase, ctx.user.id, held.reservation, {
      feature: "research",
      kind: "script_hooks",
      model: result.model,
    });
  } catch (error) {
    await releaseResearchCredit(ctx.supabase, ctx.user.id, held.reservation);
    return { message: generationMessage(error) };
  }

  revalidatePath(`/dashboard/research/scripts/${id}`);
  return { ok: true, message: "Hooks generated." };
}

/** The final stage: the script itself, written from everything above it. */
export async function generateDraftScriptAction(
  _previous: StudioFormState,
  formData: FormData,
): Promise<StudioFormState> {
  const ctx = await context();
  if (!ctx) return { message: "No workspace is selected." };
  const id = String(formData.get("draft_id") ?? "");
  if (!UUID.test(id)) return { message: "Unknown draft." };
  const draft = await getScriptDraft(ctx.supabase, id);
  if (!draft?.topic) return { message: "Describe the topic first." };

  const held = await reserveCredit(ctx, "script_write", id);
  if (!held.ok) return { message: held.reason };

  const persona = await getPersona(ctx.supabase, ctx.active.id);

  // When the draft came from a video, the breakdown's SHAPE goes in — never
  // the original's words. Same rule as the video generator: a remix by
  // construction, because the wording is not in the prompt to copy.
  let framework: string | null = null;
  if (draft.video_id) {
    const row = await getBreakdown(ctx.supabase, draft.video_id);
    if (row) framework = renderBreakdownForPrompt(toBreakdown(row));
  }

  const prompt = [
    "You write scripts for short-form video, spoken to camera.",
    "",
    "Write a complete script. Rules:",
    "- Open with the hook below, word for word, as the first line.",
    "- 45 to 90 seconds spoken. No scene directions unless they change what is said.",
    "- Short sentences. Every line earns the next one.",
    "- End on a specific line, not 'follow for more'.",
    "",
    `Topic: ${draft.topic}`,
    draft.chosen_hook ? `Hook (use verbatim as the first line): ${draft.chosen_hook}` : "",
    draft.style_notes ? `Style: ${draft.style_notes}` : "",
    personaLine(persona) ?? "",
    draft.research_notes ? `\nResearch to draw on:\n${draft.research_notes.slice(0, 4000)}` : "",
    framework ? `\n${framework}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const result = await generateFromPrompt(prompt);
    await updateScriptDraft(ctx.supabase, id, {
      script: result.output,
      stage: "script",
    });
    await annotateResearchCredit(ctx.supabase, ctx.user.id, held.reservation, {
      feature: "research",
      kind: "script_write",
      model: result.model,
    });
  } catch (error) {
    await releaseResearchCredit(ctx.supabase, ctx.user.id, held.reservation);
    return { message: generationMessage(error) };
  }

  revalidatePath(`/dashboard/research/scripts/${id}`);
  return { ok: true, message: "Script written." };
}

function generationMessage(error: unknown): string {
  if (error instanceof GenerationError) {
    return error.code === "not_configured"
      ? "AI is not configured on this deployment yet — no credit was used."
      : `${error.message} — no credit was used.`;
  }
  return `That failed: ${(error as Error).message} — no credit was used.`;
}

// ── channel discovery ──────────────────────────────────────────────────────

export type DiscoverState = StudioFormState & {
  groups?: { group: string; channels: ChannelCandidate[] }[];
  /** Echoed back so the form keeps what the user typed after a submit. */
  query?: string;
};

/**
 * Resolve a batch of handles against the platform, dropping the ones that do
 * not exist.
 *
 * Uses the provider's EXACT lookup, never its fuzzy one. That is the whole
 * mechanism: a model-suggested handle that does not exist must return nothing,
 * and a fuzzy search would instead return a nearest match for any string —
 * turning every hallucination into a real, unrelated channel with a real
 * follower count, which is worse than showing the hallucination.
 *
 * On YouTube it is also 1 quota unit instead of 100. A twenty-handle group
 * through search.list would be 2,000 units of a 10,000-unit daily allowance
 * shared by every customer on the deployment.
 *
 * Serial rather than parallel on purpose: these are third-party APIs with
 * per-app rate limits, and twenty simultaneous lookups from one person's
 * search box is exactly the burst the Phase 6 budget work exists to prevent.
 */
async function resolveMany(
  platform: ResearchPlatform,
  inputs: string[],
  ctx: ProviderContext,
  watching: Set<string>,
  group: string,
): Promise<ChannelCandidate[]> {
  const provider = getResearchProvider(platform);
  const out: ChannelCandidate[] = [];
  const seen = new Set<string>();

  for (const input of inputs.slice(0, 20)) {
    try {
      // Providers without an exact lookup (Instagram, X, TikTok) resolve
      // exactly anyway — business discovery and the username endpoints are
      // both exact-match — so falling back to resolveSource is safe for them.
      const identity = provider.resolveExact
        ? await provider.resolveExact(input, ctx)
        : await provider.resolveSource(input, ctx);
      if (!identity) continue;

      // A model naming the same channel twice, or two of its groups landing on
      // one account, must not produce two identical cards.
      const key = `${identity.platform}:${identity.externalId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({ ...identity, group, watching: watching.has(key) });
    } catch {
      // A handle that does not resolve is a handle that does not exist. Not an
      // error worth showing — it is the invented-name filter doing its job.
    }
  }
  return out;
}

async function discoveryContext(
  ctx: NonNullable<Awaited<ReturnType<typeof context>>>,
  platform: ResearchPlatform,
): Promise<{ provider: ProviderContext; watching: Set<string> }> {
  const sources = await listSources(ctx.supabase, ctx.active.id);
  const watching = new Set(
    sources.map((source) => `${source.platform}:${source.external_id}`),
  );

  const provider = getResearchProvider(platform);
  if (!provider.capabilities.requiresConnection) {
    return { provider: {}, watching };
  }
  const connections = await listConnections(ctx.supabase, ctx.active.id);
  const match = connections.find(
    (c) => c.platform === platform && c.status === "active",
  );
  if (!match) {
    throw new ResearchProviderError(
      `Connect a ${platform} account in this workspace first — research reads through it.`,
      "needs_connection",
    );
  }
  const { row, tokens } = await getFreshConnectionTokens(
    ctx.supabase,
    match.id,
  );
  return {
    provider: {
      accessToken: tokens.accessToken,
      platformAccountId: row.platform_account_id,
    },
    watching,
  };
}

function readPlatform(formData: FormData): ResearchPlatform {
  const raw = String(formData.get("platform") ?? "youtube");
  return (RESEARCH_PLATFORMS as readonly string[]).includes(raw)
    ? (raw as ResearchPlatform)
    : "youtube";
}

function readTiers(formData: FormData): SizeTierId[] {
  const wanted = new Set(formData.getAll("size").map(String));
  return SIZE_TIERS.filter((tier) => wanted.has(tier.id)).map((tier) => tier.id);
}

/** The Search tab: a free-text query straight to the platform's own search. */
export async function searchChannelsAction(
  _previous: DiscoverState,
  formData: FormData,
): Promise<DiscoverState> {
  const ctx = await context();
  if (!ctx) return { message: "No workspace is selected." };

  const query = String(formData.get("query") ?? "").trim();
  if (!query) return { message: "Type what you are looking for." };
  const platform = readPlatform(formData);
  const tiers = readTiers(formData);
  const provider = getResearchProvider(platform);

  try {
    const { provider: providerCtx, watching } = await discoveryContext(
      ctx,
      platform,
    );

    // Platforms without a search endpoint are not broken, they are exact-match:
    // Instagram's business discovery needs the username, so a search there is a
    // lookup. Saying so beats an empty result the user cannot explain.
    const identities = provider.capabilities.searchChannels
      ? await provider.searchChannels!(query, providerCtx, 12)
      : [await provider.resolveSource(query, providerCtx)];

    const channels = identities
      .filter((identity) => matchesSizeTiers(identity.followerCount, tiers))
      .map((identity) => ({
        ...identity,
        group: provider.label,
        watching: watching.has(`${identity.platform}:${identity.externalId}`),
      }));

    if (channels.length === 0) {
      return {
        query,
        message: provider.capabilities.searchChannels
          ? "Nothing matched — try fewer words, or widen the size filter."
          : `${provider.label} has no channel search, so this looks up an exact handle. Check the spelling.`,
      };
    }
    return { query, ok: true, groups: [{ group: provider.label, channels }] };
  } catch (error) {
    if (error instanceof ResearchProviderError) {
      return { query, message: error.message };
    }
    return { query, message: `Search failed: ${(error as Error).message}` };
  }
}

/**
 * The Describe and Suggested tabs.
 *
 * Costs one credit, because it is a model call. What the model produces is
 * never shown: every name it proposes is looked up against the platform first,
 * and only real channels survive. That is what makes this safe to offer at all.
 */
export async function describeChannelsAction(
  _previous: DiscoverState,
  formData: FormData,
): Promise<DiscoverState> {
  const ctx = await context();
  if (!ctx) return { message: "No workspace is selected." };

  const platform = readPlatform(formData);
  const tiers = readTiers(formData);
  const mode = String(formData.get("mode") ?? "describe");

  const sources = await listSources(ctx.supabase, ctx.active.id);
  const watchingHandles = sources
    .map((source) => source.handle ?? source.title)
    .filter(Boolean);

  // "Suggested" is Describe with the watchlist as the description: more of what
  // you already chose. With an empty watchlist there is nothing to be more of,
  // so it asks for a description instead of guessing.
  const description =
    mode === "suggest"
      ? watchingHandles.slice(0, 20).join(", ")
      : String(formData.get("query") ?? "").trim();

  if (!description) {
    return {
      message:
        mode === "suggest"
          ? "Add a channel or two first — suggestions are based on what you already track."
          : "Describe the kind of content you want to study.",
    };
  }

  const held = await reserveCredit(ctx, "channel_discovery", null);
  if (!held.ok) return { message: held.reason, query: description };

  try {
    const { provider: providerCtx, watching } = await discoveryContext(
      ctx,
      platform,
    );

    const result = await generateFromPrompt(
      buildChannelSuggestionPrompt({
        description,
        platform: getResearchProvider(platform).label,
        alreadyWatching: watchingHandles,
      }),
    );

    // The call happened and cost money, whatever shape the answer arrived in,
    // so the reservation stands and is simply annotated. Releasing it here
    // would make a badly-shaped answer free to retry forever.
    await annotateResearchCredit(ctx.supabase, ctx.user.id, held.reservation, {
      feature: "research",
      kind: "channel_discovery",
      model: result.model,
    });

    const parsed = parseChannelSuggestions(result.output);
    if (parsed.length === 0) {
      return {
        query: mode === "suggest" ? "" : description,
        message:
          "No usable suggestions came back. That still used a credit — the model answered, just not with anything we could look up.",
      };
    }

    const groups: { group: string; channels: ChannelCandidate[] }[] = [];
    for (const group of parsed.slice(0, 4)) {
      const channels = (
        await resolveMany(
          platform,
          group.handles,
          providerCtx,
          watching,
          group.group,
        )
      ).filter((channel) => matchesSizeTiers(channel.followerCount, tiers));
      if (channels.length > 0) groups.push({ group: group.group, channels });
    }

    if (groups.length === 0) {
      return {
        query: mode === "suggest" ? "" : description,
        message:
          "Every suggestion turned out not to exist on that platform, or fell outside the size filter. Try a different description.",
      };
    }
    return { ok: true, query: mode === "suggest" ? "" : description, groups };
  } catch (error) {
    await releaseResearchCredit(ctx.supabase, ctx.user.id, held.reservation);
    if (error instanceof ResearchProviderError) return { message: error.message };
    return { message: generationMessage(error) };
  }
}

/** The Add URL tab: paste a list, resolve each, show what came back. */
export async function parseChannelUrlsAction(
  _previous: DiscoverState,
  formData: FormData,
): Promise<DiscoverState> {
  const ctx = await context();
  if (!ctx) return { message: "No workspace is selected." };

  const raw = String(formData.get("query") ?? "");
  const inputs = parsePastedChannels(raw);
  if (inputs.length === 0) return { message: "Paste at least one channel URL." };

  const platform = readPlatform(formData);
  try {
    const { provider: providerCtx, watching } = await discoveryContext(
      ctx,
      platform,
    );
    const channels = await resolveMany(
      platform,
      inputs,
      providerCtx,
      watching,
      "Successfully parsed",
    );
    if (channels.length === 0) {
      return { query: raw, message: "None of those resolved to a channel." };
    }
    return {
      query: raw,
      ok: true,
      message:
        channels.length < inputs.length
          ? `${channels.length} of ${inputs.length} resolved. The rest were not found.`
          : undefined,
      groups: [{ group: "Successfully parsed", channels }],
    };
  } catch (error) {
    if (error instanceof ResearchProviderError) {
      return { query: raw, message: error.message };
    }
    return { query: raw, message: `Could not parse: ${(error as Error).message}` };
  }
}

/**
 * Add every ticked channel to the watchlist.
 *
 * Checks the source cap per channel rather than once for the batch: a user two
 * short of their limit who ticks ten channels should get two and a clear
 * sentence, not a refusal of all ten or a silent overshoot past the cap.
 */
export async function addChannelsAction(
  _previous: StudioFormState,
  formData: FormData,
): Promise<StudioFormState> {
  const ctx = await context();
  if (!ctx) return { message: "No workspace is selected." };

  // Each pick carries its own platform, so switching the dropdown after
  // ticking cannot file a YouTube channel under Instagram — which upsert would
  // happily accept, because the conflict key includes the platform.
  const picked = formData
    .getAll("channel")
    .map(String)
    .map(parsePickedChannel)
    .filter((entry): entry is PickedChannel => entry !== null);
  if (picked.length === 0) return { message: "Tick at least one channel." };

  // The channels arrive fully resolved from the discovery step, so no provider
  // call is needed here — only the connection each will later sync through.
  const connections = await listConnections(ctx.supabase, ctx.active.id);
  const connectionFor = new Map<ResearchPlatform, string | null>();
  for (const platform of new Set(picked.map((entry) => entry.platform))) {
    const provider = getResearchProvider(platform);
    if (!provider.capabilities.requiresConnection) {
      connectionFor.set(platform, null);
      continue;
    }
    const match = connections.find(
      (c) => c.platform === platform && c.status === "active",
    );
    if (!match) {
      return {
        message: `Connect a ${provider.label} account in this workspace first — research reads through it.`,
      };
    }
    connectionFor.set(platform, match.id);
  }

  let added = 0;
  let failed = 0;
  let stoppedBy: string | null = null;

  for (const entry of picked) {
    const snapshot = await getEntitlementSnapshot(
      ctx.supabase,
      ctx.user.id,
      ctx.active.id,
    );
    const decision = canUserDo(snapshot, { type: "track_research_source" });
    if (!decision.allowed) {
      stoppedBy = decision.reason;
      break;
    }

    let row;
    try {
      row = await upsertSource(ctx.supabase, {
        userId: ctx.user.id,
        workspaceId: ctx.active.id,
        platform: entry.platform,
        externalId: entry.externalId,
        handle: entry.handle,
        title: entry.title || entry.externalId,
        thumbnailUrl: entry.thumbnailUrl,
        followerCount: entry.followerCount,
        connectionId: connectionFor.get(entry.platform) ?? null,
      });
    } catch {
      // The row itself did not land, so this one genuinely was not added.
      // Counting it as a success is how "Added 3 channels" ends up meaning
      // none.
      failed += 1;
      continue;
    }

    added += 1;
    try {
      // Sync immediately: a channel that shows no videos after being added
      // reads as broken, whatever the tooltip says.
      await syncSource(toStoredSource(row), createSyncStore(ctx.supabase));
    } catch {
      // A sync failure is forgivable in a way an insert failure is not — the
      // row exists and the next sweep will pick it up.
    }
  }

  revalidatePath("/dashboard/research");
  revalidatePath("/dashboard/research/channels");

  if (added === 0) {
    return {
      message:
        stoppedBy ??
        (failed > 0 ? "Those channels could not be added." : "Nothing was added."),
    };
  }
  const suffix = [
    stoppedBy,
    failed > 0 ? `${failed} could not be added.` : null,
  ]
    .filter(Boolean)
    .join(" ");
  return {
    ok: true,
    message: `Added ${added} ${added === 1 ? "channel" : "channels"}.${suffix ? ` ${suffix}` : ""}`,
  };
}

