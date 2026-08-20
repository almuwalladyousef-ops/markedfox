import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ResearchPlatform } from "./types";

// The Supabase side of the research studio: the idea queue, the hook vault,
// the auto-analyze rules, saved filters, the persona, and script drafts.
//
// Split from store.ts rather than appended to it because that file is already
// the sync engine's storage layer and this is the workspace a person sits in.
// Same conventions: the caller passes the client, so a server action's client
// carries RLS and the scheduler's service-role client does not pretend to.

// ── ideas ──────────────────────────────────────────────────────────────────

export type IdeaStatus = "inbox" | "shortlisted" | "discarded";

export interface IdeaRow {
  id: string;
  video_id: string;
  title: string;
  summary: string | null;
  status: IdeaStatus;
  note: string | null;
  origin: "manual" | "automation";
  created_at: string;
}

export type IdeaWithVideo = IdeaRow & {
  video: {
    id: string;
    title: string;
    url: string;
    thumbnail_url: string | null;
    view_count: number | null;
    outlier_score: number | null;
    engagement_rate: number | null;
    published_at: string | null;
    source: {
      title: string;
      handle: string | null;
      platform: ResearchPlatform;
      baseline_sample: number;
    };
  };
};

const IDEA_COLUMNS = "id,video_id,title,summary,status,note,origin,created_at";

const IDEA_VIDEO_SELECT = `${IDEA_COLUMNS},research_videos!inner(id,title,url,thumbnail_url,view_count,outlier_score,engagement_rate,published_at,research_sources!inner(title,handle,platform,baseline_sample))`;

type RawIdeaJoin = IdeaRow & {
  research_videos: {
    id: string;
    title: string;
    url: string;
    thumbnail_url: string | null;
    view_count: number | null;
    outlier_score: number | null;
    engagement_rate: number | null;
    published_at: string | null;
    research_sources: {
      title: string;
      handle: string | null;
      platform: ResearchPlatform;
      baseline_sample: number;
    };
  };
};

function toIdea(row: RawIdeaJoin): IdeaWithVideo {
  const { research_videos: video, ...idea } = row;
  const { research_sources: source, ...rest } = video;
  return { ...idea, video: { ...rest, source } };
}

export async function listIdeas(
  supabase: SupabaseClient,
  workspaceId: string,
  status: IdeaStatus,
  limit = 100,
): Promise<IdeaWithVideo[]> {
  const { data, error } = await supabase
    .from("research_ideas")
    .select(IDEA_VIDEO_SELECT)
    .eq("workspace_id", workspaceId)
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as unknown as RawIdeaJoin[]).map(toIdea);
}

/** The nav badge. `head: true` so this costs a count, not the rows. */
export async function countInboxIdeas(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("research_ideas")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("status", "inbox");
  if (error) throw error;
  return count ?? 0;
}

export async function getIdeaForVideo(
  supabase: SupabaseClient,
  workspaceId: string,
  videoId: string,
): Promise<IdeaRow | null> {
  const { data, error } = await supabase
    .from("research_ideas")
    .select(IDEA_COLUMNS)
    .eq("workspace_id", workspaceId)
    .eq("video_id", videoId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as IdeaRow) ?? null;
}

/**
 * Put an idea in the queue, or update the one already there.
 *
 * Deliberately does NOT reset a status: re-analysing a video the user already
 * discarded must not push it back into the inbox, or an automation running
 * nightly would resurrect every rejection forever.
 */
export async function upsertIdea(
  supabase: SupabaseClient,
  input: {
    userId: string;
    workspaceId: string;
    videoId: string;
    title: string;
    summary: string | null;
    origin?: "manual" | "automation";
  },
): Promise<string> {
  const existing = await getIdeaForVideo(
    supabase,
    input.workspaceId,
    input.videoId,
  );
  if (existing) {
    const { error } = await supabase
      .from("research_ideas")
      .update({ title: input.title, summary: input.summary })
      .eq("id", existing.id);
    if (error) throw error;
    return existing.id;
  }
  const { data, error } = await supabase
    .from("research_ideas")
    .insert({
      user_id: input.userId,
      workspace_id: input.workspaceId,
      video_id: input.videoId,
      title: input.title,
      summary: input.summary,
      origin: input.origin ?? "manual",
    })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function setIdeaStatus(
  supabase: SupabaseClient,
  ideaId: string,
  status: IdeaStatus,
): Promise<void> {
  const { error } = await supabase
    .from("research_ideas")
    .update({ status })
    .eq("id", ideaId);
  if (error) throw error;
}

export async function setIdeaNote(
  supabase: SupabaseClient,
  ideaId: string,
  note: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("research_ideas")
    .update({ note })
    .eq("id", ideaId);
  if (error) throw error;
}

/** Empty the inbox in one move. Discards rather than deletes, so the rows keep
 *  doing their other job: stopping an automation re-suggesting the same video. */
export async function discardAllInbox(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<void> {
  const { error } = await supabase
    .from("research_ideas")
    .update({ status: "discarded" })
    .eq("workspace_id", workspaceId)
    .eq("status", "inbox");
  if (error) throw error;
}

// ── hook vault ─────────────────────────────────────────────────────────────

export interface HookTemplateRow {
  id: string;
  video_id: string | null;
  formula: string;
  example: string | null;
  category: string | null;
  source_handle: string | null;
  source_views: number | null;
  favorite: boolean;
  created_at: string;
}

const HOOK_COLUMNS =
  "id,video_id,formula,example,category,source_handle,source_views,favorite,created_at";

export async function listHookTemplates(
  supabase: SupabaseClient,
  workspaceId: string,
  options: { search?: string; favoritesOnly?: boolean; limit?: number } = {},
): Promise<HookTemplateRow[]> {
  let query = supabase
    .from("research_hook_templates")
    .select(HOOK_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("favorite", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 200);

  if (options.favoritesOnly) query = query.eq("favorite", true);
  if (options.search) {
    const safe = options.search.replace(/[,()"\\]/g, " ").trim();
    if (safe) {
      query = query.or(
        `formula.ilike.%${safe}%,source_handle.ilike.%${safe}%,category.ilike.%${safe}%`,
      );
    }
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data as unknown as HookTemplateRow[]) ?? [];
}

export async function saveHookTemplate(
  supabase: SupabaseClient,
  input: {
    userId: string;
    workspaceId: string;
    videoId: string | null;
    formula: string;
    example: string | null;
    category: string | null;
    sourceHandle: string | null;
    sourceViews: number | null;
  },
): Promise<void> {
  const { error } = await supabase.from("research_hook_templates").insert({
    user_id: input.userId,
    workspace_id: input.workspaceId,
    video_id: input.videoId,
    formula: input.formula,
    example: input.example,
    category: input.category,
    source_handle: input.sourceHandle,
    source_views: input.sourceViews,
  });
  if (error) throw error;
}

export async function toggleHookFavorite(
  supabase: SupabaseClient,
  id: string,
  favorite: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("research_hook_templates")
    .update({ favorite })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteHookTemplate(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("research_hook_templates")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function getHookTemplates(
  supabase: SupabaseClient,
  ids: string[],
): Promise<HookTemplateRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("research_hook_templates")
    .select(HOOK_COLUMNS)
    .in("id", ids);
  if (error) throw error;
  return (data as unknown as HookTemplateRow[]) ?? [];
}

// ── auto-analyze rules ─────────────────────────────────────────────────────

export interface AutomationRow {
  id: string;
  name: string;
  source_id: string | null;
  min_outlier_score: number;
  min_views: number;
  min_engagement_rate: number;
  daily_limit: number;
  active: boolean;
  last_run_at: string | null;
  user_id: string;
  workspace_id: string;
}

const AUTOMATION_COLUMNS =
  "id,name,source_id,min_outlier_score,min_views,min_engagement_rate,daily_limit,active,last_run_at,user_id,workspace_id";

export async function listAutomations(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<AutomationRow[]> {
  const { data, error } = await supabase
    .from("research_automations")
    .select(AUTOMATION_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as unknown as AutomationRow[]) ?? [];
}

export async function upsertAutomation(
  supabase: SupabaseClient,
  input: {
    id?: string;
    userId: string;
    workspaceId: string;
    name: string;
    sourceId: string | null;
    minOutlierScore: number;
    minViews: number;
    minEngagementRate: number;
    dailyLimit: number;
    active: boolean;
  },
): Promise<void> {
  const row = {
    user_id: input.userId,
    workspace_id: input.workspaceId,
    name: input.name,
    source_id: input.sourceId,
    min_outlier_score: input.minOutlierScore,
    min_views: input.minViews,
    min_engagement_rate: input.minEngagementRate,
    daily_limit: input.dailyLimit,
    active: input.active,
  };
  const { error } = input.id
    ? await supabase.from("research_automations").update(row).eq("id", input.id)
    : await supabase.from("research_automations").insert(row);
  if (error) throw error;
}

export async function deleteAutomation(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("research_automations")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

/** Rules due a run, for the scheduler sweep. Service-role client. */
export async function listDueAutomations(
  supabase: SupabaseClient,
  limit = 5,
): Promise<AutomationRow[]> {
  const { data, error } = await supabase
    .from("research_automations")
    .select(AUTOMATION_COLUMNS)
    .eq("active", true)
    .order("last_run_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw error;
  return (data as unknown as AutomationRow[]) ?? [];
}

export async function markAutomationRun(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("research_automations")
    .update({ last_run_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// ── saved filters ──────────────────────────────────────────────────────────

export interface SavedFilterRow {
  id: string;
  name: string;
  filters: Record<string, string>;
}

export async function listSavedFilters(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<SavedFilterRow[]> {
  const { data, error } = await supabase
    .from("research_saved_filters")
    .select("id,name,filters")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as unknown as SavedFilterRow[]) ?? [];
}

export async function saveFilter(
  supabase: SupabaseClient,
  input: {
    userId: string;
    workspaceId: string;
    name: string;
    filters: Record<string, string>;
  },
): Promise<void> {
  const { error } = await supabase.from("research_saved_filters").insert({
    user_id: input.userId,
    workspace_id: input.workspaceId,
    name: input.name,
    filters: input.filters,
  });
  if (error) throw error;
}

export async function deleteSavedFilter(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("research_saved_filters")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ── persona ────────────────────────────────────────────────────────────────

export interface PersonaRow {
  niche: string | null;
  audience: string | null;
  tone: string | null;
  avoid: string | null;
}

export async function getPersona(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<PersonaRow | null> {
  const { data, error } = await supabase
    .from("research_personas")
    .select("niche,audience,tone,avoid")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as PersonaRow) ?? null;
}

export async function savePersona(
  supabase: SupabaseClient,
  input: { userId: string; workspaceId: string } & PersonaRow,
): Promise<void> {
  const { error } = await supabase.from("research_personas").upsert(
    {
      workspace_id: input.workspaceId,
      user_id: input.userId,
      niche: input.niche,
      audience: input.audience,
      tone: input.tone,
      avoid: input.avoid,
    },
    { onConflict: "workspace_id" },
  );
  if (error) throw error;
}

// ── script drafts ──────────────────────────────────────────────────────────

export const SCRIPT_STAGES = [
  "topic",
  "research",
  "hook",
  "style",
  "script",
] as const;

export type ScriptStage = (typeof SCRIPT_STAGES)[number];

export const STAGE_LABELS: Record<ScriptStage, string> = {
  topic: "Topic",
  research: "Research",
  hook: "Hook",
  style: "Style",
  script: "Script",
};

export interface HookOption {
  text: string;
  /** Which analysed video's pattern produced it — the social proof. */
  sourceHandle?: string;
  sourceViews?: number;
  thumbnailUrl?: string;
}

export interface ScriptDraftRow {
  id: string;
  title: string;
  video_id: string | null;
  idea_id: string | null;
  project_id: string | null;
  stage: ScriptStage;
  topic: string | null;
  research_notes: string | null;
  hook_options: HookOption[];
  chosen_hook: string | null;
  style_notes: string | null;
  script: string | null;
  created_at: string;
  updated_at: string;
}

const DRAFT_COLUMNS =
  "id,title,video_id,idea_id,project_id,stage,topic,research_notes,hook_options,chosen_hook,style_notes,script,created_at,updated_at";

export async function listScriptDrafts(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<ScriptDraftRow[]> {
  const { data, error } = await supabase
    .from("research_script_drafts")
    .select(DRAFT_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data as unknown as ScriptDraftRow[]) ?? [];
}

export async function getScriptDraft(
  supabase: SupabaseClient,
  id: string,
): Promise<(ScriptDraftRow & { workspace_id: string; user_id: string }) | null> {
  const { data, error } = await supabase
    .from("research_script_drafts")
    .select(`${DRAFT_COLUMNS},workspace_id,user_id`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (
    (data as unknown as ScriptDraftRow & {
      workspace_id: string;
      user_id: string;
    }) ?? null
  );
}

export async function createScriptDraft(
  supabase: SupabaseClient,
  input: {
    userId: string;
    workspaceId: string;
    title: string;
    topic?: string | null;
    videoId?: string | null;
    ideaId?: string | null;
    projectId?: string | null;
  },
): Promise<string> {
  const { data, error } = await supabase
    .from("research_script_drafts")
    .insert({
      user_id: input.userId,
      workspace_id: input.workspaceId,
      title: input.title,
      topic: input.topic ?? null,
      video_id: input.videoId ?? null,
      idea_id: input.ideaId ?? null,
      project_id: input.projectId ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function updateScriptDraft(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<{
    title: string;
    stage: ScriptStage;
    topic: string | null;
    research_notes: string | null;
    hook_options: HookOption[];
    chosen_hook: string | null;
    style_notes: string | null;
    script: string | null;
    project_id: string | null;
  }>,
): Promise<void> {
  const { error } = await supabase
    .from("research_script_drafts")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteScriptDraft(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("research_script_drafts")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
