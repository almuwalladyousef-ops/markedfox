// Shapes and constants shared by the studio's server store and its client
// components.
//
// Split out of studio-store.ts because that file is "server-only", and a client
// component importing a VALUE from it — the stage list, a label map — drags the
// whole server module into the browser bundle and fails the build. Types alone
// would be erased; constants are not.

import type { ResearchPlatform } from "./types";

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

// ── saved filters ──────────────────────────────────────────────────────────

export interface SavedFilterRow {
  id: string;
  name: string;
  /** key → every value for that key, because the feed's channel and status
   *  controls are multi-value. Older rows stored a bare string; readers use
   *  savedFilterParams, which accepts both. */
  filters: Record<string, string | string[]>;
}

/** A saved filter back as a query string. Tolerant of the single-value shape
 *  rows written before multi-select was stored properly. */
export function savedFilterParams(
  filters: Record<string, string | string[]>,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (typeof item === "string" && item) params.append(key, item);
    }
  }
  return params;
}

// ── persona ────────────────────────────────────────────────────────────────

export interface PersonaRow {
  niche: string | null;
  audience: string | null;
  tone: string | null;
  avoid: string | null;
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

/** How many hooks one script draft may accumulate. A ceiling because the
 *  column is jsonb, and a list nobody can read is not a longer list. */
export const MAX_HOOK_OPTIONS = 24;

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
