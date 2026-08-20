import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getFreshConnectionTokens } from "@/lib/connections/store";

import type { Breakdown } from "./breakdown";
import type { StoredSource, SyncStore, VideoUpsert } from "./sync";
import type { ProviderContext, ResearchPlatform } from "./types";

// The Supabase side of research. Everything here runs through whichever client
// it is handed: the user's own client from a server action (so RLS scopes it),
// or the service-role client from the scheduler sweep (which filters by
// user_id explicitly, because RLS is not there to catch a mistake).

export interface SourceRow {
  id: string;
  user_id: string;
  workspace_id: string;
  platform: ResearchPlatform;
  external_id: string;
  handle: string | null;
  title: string;
  thumbnail_url: string | null;
  follower_count: number | null;
  connection_id: string | null;
  baseline_views: number | null;
  baseline_sample: number;
  last_synced_at: string | null;
  last_error: string | null;
  created_at: string;
}

export interface VideoRow {
  id: string;
  source_id: string;
  external_id: string;
  title: string;
  description: string | null;
  url: string;
  thumbnail_url: string | null;
  published_at: string | null;
  duration_seconds: number | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  outlier_score: number | null;
  baseline_views: number | null;
  /** (likes + comments) / views, computed by the database. Null when we have
      no view count to divide by. */
  engagement_rate: number | null;
}

const SOURCE_COLUMNS =
  "id,user_id,workspace_id,platform,external_id,handle,title,thumbnail_url,follower_count,connection_id,baseline_views,baseline_sample,last_synced_at,last_error,created_at";

const VIDEO_COLUMNS =
  "id,source_id,external_id,title,description,url,thumbnail_url,published_at,duration_seconds,view_count,like_count,comment_count,outlier_score,baseline_views,engagement_rate";

export async function listSources(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<SourceRow[]> {
  const { data, error } = await supabase
    .from("research_sources")
    .select(SOURCE_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as SourceRow[];
}

export async function getSource(
  supabase: SupabaseClient,
  sourceId: string,
): Promise<SourceRow | null> {
  const { data, error } = await supabase
    .from("research_sources")
    .select(SOURCE_COLUMNS)
    .eq("id", sourceId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as SourceRow) ?? null;
}

export async function upsertSource(
  supabase: SupabaseClient,
  input: {
    userId: string;
    workspaceId: string;
    platform: ResearchPlatform;
    externalId: string;
    handle: string | null;
    title: string;
    thumbnailUrl: string | null;
    followerCount: number | null;
    connectionId: string | null;
  },
): Promise<SourceRow> {
  // onConflict on (workspace_id, platform, external_id): adding a channel that
  // is already watched refreshes its details instead of erroring.
  const { data, error } = await supabase
    .from("research_sources")
    .upsert(
      {
        user_id: input.userId,
        workspace_id: input.workspaceId,
        platform: input.platform,
        external_id: input.externalId,
        handle: input.handle,
        title: input.title,
        thumbnail_url: input.thumbnailUrl,
        follower_count: input.followerCount,
        connection_id: input.connectionId,
        last_error: null,
      },
      { onConflict: "workspace_id,platform,external_id" },
    )
    .select(SOURCE_COLUMNS)
    .single();
  if (error) throw error;
  return data as unknown as SourceRow;
}

export async function deleteSource(
  supabase: SupabaseClient,
  sourceId: string,
): Promise<void> {
  const { error } = await supabase
    .from("research_sources")
    .delete()
    .eq("id", sourceId);
  if (error) throw error;
}

export type FeedSort =
  | "outlier"
  | "views"
  | "engagement"
  | "recent";

export interface FeedFilters {
  /** Only videos at or above this multiple of their channel's baseline. */
  minScore?: number;
  maxScore?: number;
  /** Substring match over title and description. */
  keywords?: string;
  sourceId?: string;
  /** Several channels at once — the feed's channel picker is multi-select. */
  sourceIds?: string[];
  platform?: ResearchPlatform;
  minViews?: number;
  maxViews?: number;
  /** Fractions, not percentages: 0.02 is 2%. */
  minEngagement?: number;
  maxEngagement?: number;
  /** Only videos published within this many days. */
  postedWithinDays?: number;
  /** Undefined = both. True = only broken down, false = only not. */
  analyzed?: boolean;
  sort?: FeedSort;
  limit?: number;
}

export type FeedVideo = VideoRow & {
  source: {
    id: string;
    title: string;
    platform: ResearchPlatform;
    handle: string | null;
    thumbnail_url: string | null;
    baseline_sample: number;
  };
};

const FEED_ORDER: Record<FeedSort, { column: string; ascending: boolean }> = {
  outlier: { column: "outlier_score", ascending: false },
  views: { column: "view_count", ascending: false },
  engagement: { column: "engagement_rate", ascending: false },
  recent: { column: "published_at", ascending: false },
};

/**
 * The outlier feed. Every filter here is applied by Postgres rather than in the
 * page, because the point of a filter is to not load the rows you are throwing
 * away — a workspace tracking 150 channels has tens of thousands of videos.
 *
 * `analyzed` is the exception: it needs the set of videos that have a breakdown,
 * which lives in another table with no foreign key the PostgREST filter syntax
 * can reach across cheaply. It is applied after the fetch, and the caller is
 * told so by this comment rather than by a surprise.
 */
export async function listFeed(
  supabase: SupabaseClient,
  workspaceId: string,
  filters: FeedFilters = {},
): Promise<FeedVideo[]> {
  const sort = FEED_ORDER[filters.sort ?? "outlier"];
  let query = supabase
    .from("research_videos")
    .select(
      `${VIDEO_COLUMNS},research_sources!inner(id,title,platform,handle,thumbnail_url,baseline_sample)`,
    )
    .eq("workspace_id", workspaceId)
    .order(sort.column, { ascending: sort.ascending, nullsFirst: false })
    .limit(filters.limit ?? 60);

  if (filters.minScore !== undefined) {
    query = query.gte("outlier_score", filters.minScore);
  }
  if (filters.maxScore !== undefined) {
    query = query.lte("outlier_score", filters.maxScore);
  }
  if (filters.sourceId) {
    query = query.eq("source_id", filters.sourceId);
  }
  if (filters.sourceIds && filters.sourceIds.length > 0) {
    query = query.in("source_id", filters.sourceIds);
  }
  if (filters.platform) {
    query = query.eq("research_sources.platform", filters.platform);
  }
  if (filters.minViews !== undefined) {
    query = query.gte("view_count", filters.minViews);
  }
  if (filters.maxViews !== undefined) {
    query = query.lte("view_count", filters.maxViews);
  }
  if (filters.minEngagement !== undefined) {
    query = query.gte("engagement_rate", filters.minEngagement);
  }
  if (filters.maxEngagement !== undefined) {
    query = query.lte("engagement_rate", filters.maxEngagement);
  }
  if (filters.postedWithinDays !== undefined && filters.postedWithinDays > 0) {
    const since = new Date(
      Date.now() - filters.postedWithinDays * 24 * 60 * 60 * 1000,
    );
    query = query.gte("published_at", since.toISOString());
  }
  if (filters.keywords) {
    // Escape the PostgREST `or` list separators before interpolating a user
    // string into it, or a comma in someone's search turns into a second filter.
    const safe = filters.keywords.replace(/[,()"\\]/g, " ").trim();
    if (safe) {
      query = query.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`);
    }
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []).map((row) => {
    const { research_sources: source, ...video } = row as unknown as VideoRow & {
      research_sources: FeedVideo["source"];
    };
    return { ...video, source };
  });

  if (filters.analyzed === undefined) return rows;
  const withBreakdown = await breakdownVideoIds(
    supabase,
    rows.map((r) => r.id),
  );
  return rows.filter((r) => withBreakdown.has(r.id) === filters.analyzed);
}

export async function getVideo(
  supabase: SupabaseClient,
  videoId: string,
): Promise<(VideoRow & { workspace_id: string; user_id: string }) | null> {
  const { data, error } = await supabase
    .from("research_videos")
    .select(`${VIDEO_COLUMNS},workspace_id,user_id`)
    .eq("id", videoId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as VideoRow & { workspace_id: string; user_id: string }) ?? null;
}

export async function getTranscript(
  supabase: SupabaseClient,
  videoId: string,
): Promise<{ text: string; origin: string; language: string | null } | null> {
  const { data, error } = await supabase
    .from("research_transcripts")
    .select("text,origin,language")
    .eq("video_id", videoId)
    .maybeSingle();
  if (error) throw error;
  return (data as { text: string; origin: string; language: string | null }) ?? null;
}

export async function saveTranscript(
  supabase: SupabaseClient,
  input: {
    videoId: string;
    userId: string;
    workspaceId: string;
    text: string;
    language: string | null;
    origin: "captions" | "unavailable";
  },
): Promise<void> {
  const { error } = await supabase.from("research_transcripts").upsert(
    {
      video_id: input.videoId,
      user_id: input.userId,
      workspace_id: input.workspaceId,
      text: input.text,
      language: input.language,
      origin: input.origin,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "video_id" },
  );
  if (error) throw error;
}

export async function saveScript(
  supabase: SupabaseClient,
  input: {
    userId: string;
    workspaceId: string;
    videoId: string | null;
    kind: string;
    topic: string | null;
    output: string;
    model: string | null;
    creditsSpent: number;
    /** Whether this was written from a step-3 breakdown rather than raw video
     *  text — so "why does this script look like this" stays answerable. */
    fromBreakdown?: boolean;
  },
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("research_scripts")
    .insert({
      user_id: input.userId,
      workspace_id: input.workspaceId,
      video_id: input.videoId,
      kind: input.kind,
      topic: input.topic,
      output: input.output,
      model: input.model,
      credits_spent: input.creditsSpent,
      from_breakdown: input.fromBreakdown ?? false,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data as { id: string };
}

export async function listScripts(
  supabase: SupabaseClient,
  workspaceId: string,
  limit = 25,
): Promise<
  {
    id: string;
    kind: string;
    topic: string | null;
    output: string;
    model: string | null;
    created_at: string;
    video_id: string | null;
  }[]
> {
  const { data, error } = await supabase
    .from("research_scripts")
    .select("id,kind,topic,output,model,created_at,video_id")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as never;
}

export function toStoredSource(row: SourceRow): StoredSource {
  return {
    id: row.id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    platform: row.platform,
    externalId: row.external_id,
    handle: row.handle,
    title: row.title,
    connectionId: row.connection_id,
  };
}

/** The SyncStore the pure orchestrator writes through. */
export function createSyncStore(supabase: SupabaseClient): SyncStore {
  return {
    async contextFor(source: StoredSource): Promise<ProviderContext> {
      if (!source.connectionId) {
        throw new Error(
          "This source reads through a connected account, and its connection was removed. Reconnect the account, then re-add the source.",
        );
      }
      const { row, tokens } = await getFreshConnectionTokens(
        supabase,
        source.connectionId,
      );
      return {
        accessToken: tokens.accessToken,
        platformAccountId: row.platform_account_id,
      };
    },

    async upsertVideos(rows: VideoUpsert[]): Promise<void> {
      if (rows.length === 0) return;
      // onConflict (source_id, external_id): a re-sync updates counts and
      // rescoring in place rather than duplicating the channel's back catalogue
      // on every sweep.
      const { error } = await supabase.from("research_videos").upsert(
        rows.map((row) => ({
          source_id: row.sourceId,
          user_id: row.userId,
          workspace_id: row.workspaceId,
          external_id: row.externalId,
          title: row.title,
          description: row.description,
          url: row.url,
          thumbnail_url: row.thumbnailUrl,
          published_at: row.publishedAt,
          duration_seconds: row.durationSeconds,
          view_count: row.viewCount,
          like_count: row.likeCount,
          comment_count: row.commentCount,
          outlier_score: row.outlierScore,
          baseline_views: row.baselineViews,
          stats_updated_at: new Date().toISOString(),
        })),
        { onConflict: "source_id,external_id" },
      );
      if (error) throw error;
    },

    async updateSourceBaseline(input): Promise<void> {
      const { error } = await supabase
        .from("research_sources")
        .update({
          baseline_views: input.baselineViews,
          baseline_sample: input.baselineSample,
          last_synced_at: input.syncedAt,
          last_error: null,
        })
        .eq("id", input.sourceId);
      if (error) throw error;
    },

    async recordSourceError(sourceId: string, message: string): Promise<void> {
      const { error } = await supabase
        .from("research_sources")
        .update({ last_error: message, last_synced_at: new Date().toISOString() })
        .eq("id", sourceId);
      if (error) throw error;
    },
  };
}

/**
 * Sources the background sweep should consider: the stalest first, capped so
 * one tick cannot spend a whole day's YouTube quota.
 *
 * `olderThan` is the LOOSEST plan's interval — the widest net. The sweep then
 * filters each candidate against its own owner's plan, because refresh rate is
 * a tier difference (Studio 12h, Enterprise 1h) and the query cannot know a
 * row's plan without joining through subscriptions on every tick.
 */
export async function listStaleSources(
  service: SupabaseClient,
  olderThan: Date,
  limit: number,
): Promise<SourceRow[]> {
  const { data, error } = await service
    .from("research_sources")
    .select(SOURCE_COLUMNS)
    .or(`last_synced_at.is.null,last_synced_at.lt.${olderThan.toISOString()}`)
    .order("last_synced_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as SourceRow[];
}

/** The refresh interval a source's OWNER is entitled to, in hours. */
export async function refreshHoursForUser(
  service: SupabaseClient,
  userId: string,
): Promise<number> {
  const { data, error } = await service
    .from("subscriptions")
    .select("status, plans (limits)")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;

  const raw: unknown = data?.plans;
  const plan = (Array.isArray(raw) ? raw[0] : raw) as { limits?: Record<string, unknown> } | null;
  const active = data && (data.status === "active" || data.status === "trialing");
  const hours = active ? plan?.limits?.research_refresh_hours : undefined;
  // Anything unreadable falls back to the slowest interval: over-refreshing
  // costs quota that every tenant shares, under-refreshing costs freshness.
  return typeof hours === "number" && hours > 0 ? hours : 24;
}

// ── step 3: breakdowns ─────────────────────────────────────────────────────

export interface BreakdownRow {
  video_id: string;
  summary: string | null;
  topic: string | null;
  idea_seed: string | null;
  unique_angle: string | null;
  common_belief: string | null;
  contrarian_reality: string | null;
  hook: string | null;
  hook_type: string | null;
  hook_formula: string | null;
  text_hook: string | null;
  hook_alignment: string | null;
  curiosity_loop: string | null;
  structure: unknown;
  format_category: string | null;
  format_notes: string | null;
  format_analysis: string | null;
  visual_layout: string | null;
  takeaway: string | null;
  notes: string | null;
  model: string | null;
  created_at: string;
}

const BREAKDOWN_COLUMNS =
  "video_id,summary,topic,idea_seed,unique_angle,common_belief,contrarian_reality,hook,hook_type,hook_formula,text_hook,hook_alignment,curiosity_loop,structure,format_category,format_notes,format_analysis,visual_layout,takeaway,notes,model,created_at";

export async function getBreakdown(
  supabase: SupabaseClient,
  videoId: string,
): Promise<BreakdownRow | null> {
  const { data, error } = await supabase
    .from("research_breakdowns")
    .select(BREAKDOWN_COLUMNS)
    .eq("video_id", videoId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as BreakdownRow) ?? null;
}

export async function saveBreakdown(
  supabase: SupabaseClient,
  input: {
    videoId: string;
    userId: string;
    workspaceId: string;
    breakdown: Breakdown;
    model: string | null;
  },
): Promise<void> {
  const { breakdown } = input;
  const { error } = await supabase.from("research_breakdowns").upsert(
    {
      video_id: input.videoId,
      user_id: input.userId,
      workspace_id: input.workspaceId,
      summary: breakdown.summary,
      topic: breakdown.topic,
      idea_seed: breakdown.ideaSeed,
      unique_angle: breakdown.uniqueAngle,
      common_belief: breakdown.commonBelief,
      contrarian_reality: breakdown.contrarianReality,
      hook: breakdown.hook,
      hook_type: breakdown.hookType,
      hook_formula: breakdown.hookFormula,
      text_hook: breakdown.textHook,
      hook_alignment: breakdown.hookAlignment,
      curiosity_loop: breakdown.curiosityLoop,
      structure: breakdown.structure,
      format_category: breakdown.formatCategory,
      format_notes: breakdown.formatNotes,
      format_analysis: breakdown.formatAnalysis,
      visual_layout: breakdown.visualLayout,
      takeaway: breakdown.takeaway,
      notes: breakdown.notes,
      model: input.model,
    },
    { onConflict: "video_id" },
  );
  if (error) throw error;
}

/** Which of these videos already have a breakdown — so the feed can badge them
 *  without a query per row. */
export async function breakdownVideoIds(
  supabase: SupabaseClient,
  videoIds: string[],
): Promise<Set<string>> {
  if (videoIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from("research_breakdowns")
    .select("video_id")
    .in("video_id", videoIds);
  if (error) throw error;
  return new Set((data ?? []).map((row) => (row as { video_id: string }).video_id));
}

export function toBreakdown(row: BreakdownRow): Breakdown {
  const structure = Array.isArray(row.structure)
    ? (row.structure as { label?: unknown; detail?: unknown }[])
        .map((beat) => ({
          label: typeof beat.label === "string" ? beat.label : "beat",
          detail: typeof beat.detail === "string" ? beat.detail : "",
        }))
        .filter((beat) => beat.detail)
    : [];

  return {
    summary: row.summary,
    topic: row.topic,
    ideaSeed: row.idea_seed,
    uniqueAngle: row.unique_angle,
    commonBelief: row.common_belief,
    contrarianReality: row.contrarian_reality,
    hook: row.hook,
    hookType: (row.hook_type as Breakdown["hookType"]) ?? null,
    hookFormula: row.hook_formula,
    textHook: row.text_hook,
    hookAlignment: row.hook_alignment,
    curiosityLoop: row.curiosity_loop,
    structure,
    formatCategory: row.format_category,
    formatNotes: row.format_notes,
    formatAnalysis: row.format_analysis,
    visualLayout: row.visual_layout,
    takeaway: row.takeaway,
    notes: row.notes,
  };
}

// ── projects: the pipeline ─────────────────────────────────────────────────

export interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export async function listProjects(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<(ProjectRow & { item_count: number })[]> {
  const { data, error } = await supabase
    .from("research_projects")
    .select("id,name,description,created_at,research_project_items(count)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row) => {
    const { research_project_items: counts, ...project } = row as unknown as ProjectRow & {
      research_project_items: { count: number }[];
    };
    return { ...project, item_count: counts?.[0]?.count ?? 0 };
  });
}

export async function createProject(
  supabase: SupabaseClient,
  input: { userId: string; workspaceId: string; name: string; description: string | null },
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("research_projects")
    .insert({
      user_id: input.userId,
      workspace_id: input.workspaceId,
      name: input.name,
      description: input.description,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data as { id: string };
}

export async function saveToProject(
  supabase: SupabaseClient,
  input: { userId: string; workspaceId: string; projectId: string; videoId: string },
): Promise<void> {
  // onConflict on (project_id, video_id): saving the same idea twice is a
  // no-op, not an error the user has to read.
  const { error } = await supabase.from("research_project_items").upsert(
    {
      user_id: input.userId,
      workspace_id: input.workspaceId,
      project_id: input.projectId,
      video_id: input.videoId,
    },
    { onConflict: "project_id,video_id", ignoreDuplicates: true },
  );
  if (error) throw error;
}

export interface ProjectItemRow {
  id: string;
  stage: string;
  note: string | null;
  created_at: string;
  /** `baseline_sample` rides along because the outlier TIER depends on it, and
   *  the same video must not read "outlier" here and "validated outlier" in the
   *  feed — an inconsistent label is worse than either label alone. */
  video: VideoRow & {
    source: {
      title: string;
      platform: ResearchPlatform;
      baseline_sample: number;
    };
  };
}

export async function listProjectItems(
  supabase: SupabaseClient,
  projectId: string,
): Promise<ProjectItemRow[]> {
  const { data, error } = await supabase
    .from("research_project_items")
    .select(
      `id,stage,note,created_at,research_videos!inner(${VIDEO_COLUMNS},research_sources!inner(title,platform,baseline_sample))`,
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row) => {
    const { research_videos: video, ...item } = row as unknown as {
      id: string;
      stage: string;
      note: string | null;
      created_at: string;
      research_videos: VideoRow & {
        research_sources: {
          title: string;
          platform: ResearchPlatform;
          baseline_sample: number;
        };
      };
    };
    const { research_sources: source, ...rest } = video;
    return { ...item, video: { ...rest, source } };
  });
}

export async function setProjectItemStage(
  supabase: SupabaseClient,
  itemId: string,
  stage: string,
): Promise<void> {
  const { error } = await supabase
    .from("research_project_items")
    .update({ stage })
    .eq("id", itemId);
  if (error) throw error;
}

export async function removeProjectItem(
  supabase: SupabaseClient,
  itemId: string,
): Promise<void> {
  const { error } = await supabase
    .from("research_project_items")
    .delete()
    .eq("id", itemId);
  if (error) throw error;
}

export async function deleteProject(
  supabase: SupabaseClient,
  projectId: string,
): Promise<void> {
  const { error } = await supabase
    .from("research_projects")
    .delete()
    .eq("id", projectId);
  if (error) throw error;
}

// ── standalone transcripts (any pasted link) ───────────────────────────────

export async function saveLinkTranscript(
  supabase: SupabaseClient,
  input: {
    userId: string;
    workspaceId: string;
    platform: ResearchPlatform;
    externalId: string;
    url: string;
    title: string | null;
    text: string;
    language: string | null;
    origin: "captions" | "unavailable";
  },
): Promise<void> {
  const { error } = await supabase.from("research_link_transcripts").upsert(
    {
      user_id: input.userId,
      workspace_id: input.workspaceId,
      platform: input.platform,
      external_id: input.externalId,
      url: input.url,
      title: input.title,
      text: input.text,
      language: input.language,
      origin: input.origin,
    },
    { onConflict: "workspace_id,platform,external_id" },
  );
  if (error) throw error;
}

export async function listLinkTranscripts(
  supabase: SupabaseClient,
  workspaceId: string,
  limit = 20,
): Promise<
  {
    id: string;
    platform: ResearchPlatform;
    url: string;
    title: string | null;
    text: string;
    origin: string;
    created_at: string;
  }[]
> {
  const { data, error } = await supabase
    .from("research_link_transcripts")
    .select("id,platform,url,title,text,origin,created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as never;
}

/** How many channels this workspace watches — checked against the plan's cap
 *  before another is added. */
export async function countSources(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("research_sources")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw error;
  return count ?? 0;
}
