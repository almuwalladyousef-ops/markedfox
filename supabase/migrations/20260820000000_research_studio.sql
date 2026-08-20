-- Research, part three: the full studio.
--
-- Parts one and two built the engine — track channels, score outliers against
-- each channel's own median, deconstruct why a video worked, generate from the
-- deconstruction. What they did not build is the surface a person actually
-- works in all day: a filterable feed, an idea inbox that survives being
-- closed, a vault of hook formulas worth reusing, rules that do the analysis
-- while nobody is looking, and a script pipeline with stages you can walk back
-- into.
--
-- Everything here is that surface. The tenancy pattern does not change: every
-- row carries (workspace_id, user_id), the composite foreign key onto
-- workspaces, and RLS that lets a user reach only their own rows.

-- ── engagement, as a filterable number ─────────────────────────────────────
-- The feed filters on engagement rate, so it has to be a column the database
-- can compare rather than a number computed per row in the page. Generated and
-- stored, so it exists for rows that synced before this migration ran and can
-- carry an index.
--
-- Instagram business discovery hides view counts, so its rows carry likes in
-- view_count (see the sync adapter) — the ratio there is likes-relative and the
-- UI says so. Null views means no ratio at all rather than a confident zero.
alter table public.research_videos
  add column engagement_rate numeric(6, 4)
  generated always as (
    case
      when view_count is null or view_count = 0 then null
      else (coalesce(like_count, 0) + coalesce(comment_count, 0))::numeric
           / view_count::numeric
    end
  ) stored;

create index research_videos_engagement_idx
  on public.research_videos (workspace_id, engagement_rate desc nulls last);
create index research_videos_published_idx
  on public.research_videos (workspace_id, published_at desc nulls last);

-- ── the full deconstruction ────────────────────────────────────────────────
-- Part two stored the hook, the curiosity loop, the beats and a takeaway. That
-- answers "how was it made". It does not answer "what is the idea, and what
-- belief does it overturn", which is the part a remix actually needs — copying
-- someone's structure while keeping their idea is plagiarism, and copying their
-- idea while keeping your own structure is a different video. Splitting the two
-- is what makes the generator's output yours.
alter table public.research_breakdowns
  -- A paragraph a person can read instead of the transcript.
  add column summary text,
  -- The idea, in four parts: what it is about, the seed a remix starts from,
  -- the angle that makes it not-generic, and the belief it argues against.
  add column topic text,
  add column idea_seed text,
  add column unique_angle text,
  add column common_belief text,
  add column contrarian_reality text,
  -- The hook as a reusable pattern: "Most people have never [experienced]
  -- [common thing]" rather than the sentence itself. This is what the vault
  -- stores and what the hook generator fills in for a new topic.
  add column hook_formula text,
  -- The on-screen text hook, which is frequently NOT the spoken one — a video
  -- can say one thing and caption another, and the pairing is the technique.
  add column text_hook text,
  add column hook_alignment text,
  -- Storytelling format as a named category plus why it fits this idea.
  add column format_category text,
  add column format_analysis text,
  -- How it looks: shot types, text density, cut rhythm, b-roll.
  add column visual_layout text;

-- ── ideas: the triage queue between research and writing ───────────────────
-- A breakdown that is never acted on is a receipt. An idea is the same
-- breakdown turned into a decision — make it, or do not — and the decision has
-- to outlive the browser tab it was made in.
--
-- Deliberately three states. A queue with more states is a queue nobody
-- empties, and "discarded" has to be a real state rather than a delete so the
-- same video does not reappear in the inbox on the next automation run.
create table public.research_ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  workspace_id uuid not null,
  video_id uuid not null references public.research_videos (id) on delete cascade,
  title text not null,
  summary text,
  status text not null default 'inbox'
    check (status in ('inbox', 'shortlisted', 'discarded')),
  -- The user's own note, which is the only field here a model never writes.
  note text,
  -- How it arrived: 'manual' when a person pressed Shortlist on a breakdown,
  -- 'automation' when a rule produced it while nobody was watching.
  origin text not null default 'manual'
    check (origin in ('manual', 'automation')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One idea per video per workspace: re-analysing a video updates its idea
  -- rather than stacking duplicates in the inbox.
  unique (workspace_id, video_id),
  foreign key (workspace_id, user_id)
    references public.workspaces (id, owner_id) on delete cascade
);

create index research_ideas_queue_idx
  on public.research_ideas (workspace_id, status, created_at desc);

alter table public.research_ideas enable row level security;

create policy research_ideas_select_own on public.research_ideas
  for select to authenticated using (user_id = (select auth.uid()));
create policy research_ideas_insert_own on public.research_ideas
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy research_ideas_update_own on public.research_ideas
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy research_ideas_delete_own on public.research_ideas
  for delete to authenticated using (user_id = (select auth.uid()));

create trigger research_ideas_set_updated_at
  before update on public.research_ideas
  for each row execute function public.set_updated_at();

-- ── the hook vault ─────────────────────────────────────────────────────────
-- The single highest-leverage artefact in the whole pillar. A hook formula
-- extracted from a video that already earned millions of views is a pattern
-- with evidence behind it; a hook a model invents from nothing is a guess. The
-- vault is where the evidence accumulates, and it is why the product gets
-- better the longer somebody uses it.
create table public.research_hook_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  workspace_id uuid not null,
  -- Null when a formula was typed in by hand rather than lifted from a video.
  video_id uuid references public.research_videos (id) on delete set null,
  -- The pattern, with the variable parts in brackets.
  formula text not null,
  -- The verbatim line it came from, kept so the formula stays checkable.
  example text,
  category text,
  -- Denormalised from the source video so the picker can show social proof
  -- ("@handle · 1.6M views") without joining through to a row that may since
  -- have been deleted.
  source_handle text,
  source_views bigint,
  favorite boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, user_id)
    references public.workspaces (id, owner_id) on delete cascade
);

create index research_hook_templates_workspace_idx
  on public.research_hook_templates (workspace_id, favorite desc, created_at desc);

alter table public.research_hook_templates enable row level security;

create policy research_hook_templates_select_own on public.research_hook_templates
  for select to authenticated using (user_id = (select auth.uid()));
create policy research_hook_templates_insert_own on public.research_hook_templates
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy research_hook_templates_update_own on public.research_hook_templates
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy research_hook_templates_delete_own on public.research_hook_templates
  for delete to authenticated using (user_id = (select auth.uid()));

-- ── automations: analysis that happens without anyone present ──────────────
-- Every breakdown costs a credit, so an automation is a standing instruction to
-- spend. That makes the daily limit the most important column here, not the
-- thresholds: a rule with no ceiling is a rule that can empty a month's credits
-- into one bad afternoon on a channel that suddenly posted forty times.
create table public.research_automations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  workspace_id uuid not null,
  name text not null,
  -- Null = every channel this workspace watches.
  source_id uuid references public.research_sources (id) on delete cascade,
  min_outlier_score numeric(10, 3) not null default 2,
  min_views bigint not null default 0,
  min_engagement_rate numeric(6, 4) not null default 0,
  daily_limit integer not null default 5 check (daily_limit between 1 and 50),
  active boolean not null default true,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, user_id)
    references public.workspaces (id, owner_id) on delete cascade
);

create index research_automations_active_idx
  on public.research_automations (active, last_run_at nulls first);

alter table public.research_automations enable row level security;

create policy research_automations_select_own on public.research_automations
  for select to authenticated using (user_id = (select auth.uid()));
create policy research_automations_insert_own on public.research_automations
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy research_automations_update_own on public.research_automations
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy research_automations_delete_own on public.research_automations
  for delete to authenticated using (user_id = (select auth.uid()));

create trigger research_automations_set_updated_at
  before update on public.research_automations
  for each row execute function public.set_updated_at();

-- ── saved filters ──────────────────────────────────────────────────────────
-- "Videos from my list, posted in the last 14 days, at 2x or better" is a
-- question somebody asks every morning. Saving it is the difference between a
-- tool and a report.
create table public.research_saved_filters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  workspace_id uuid not null,
  name text not null,
  -- The filter object itself, stored whole. A jsonb blob is right here: the
  -- filter shape changes as the feed gains controls, and a migration per new
  -- control would be absurd for what is effectively a bookmarked URL.
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, user_id)
    references public.workspaces (id, owner_id) on delete cascade
);

create index research_saved_filters_workspace_idx
  on public.research_saved_filters (workspace_id, created_at desc);

alter table public.research_saved_filters enable row level security;

create policy research_saved_filters_select_own on public.research_saved_filters
  for select to authenticated using (user_id = (select auth.uid()));
create policy research_saved_filters_insert_own on public.research_saved_filters
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy research_saved_filters_delete_own on public.research_saved_filters
  for delete to authenticated using (user_id = (select auth.uid()));

-- ── persona: who the output is for ─────────────────────────────────────────
-- Generation without a persona produces competent copy for nobody in
-- particular. One row per workspace, because a workspace is one brand.
create table public.research_personas (
  workspace_id uuid primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  niche text,
  audience text,
  tone text,
  -- Things this brand will not say, which is often more useful than the tone.
  avoid text,
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, user_id)
    references public.workspaces (id, owner_id) on delete cascade
);

alter table public.research_personas enable row level security;

create policy research_personas_select_own on public.research_personas
  for select to authenticated using (user_id = (select auth.uid()));
create policy research_personas_insert_own on public.research_personas
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy research_personas_update_own on public.research_personas
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create trigger research_personas_set_updated_at
  before update on public.research_personas
  for each row execute function public.set_updated_at();

-- ── script drafts: the pipeline as a resumable document ────────────────────
-- Generating a script in one shot from one prompt is what a chat window
-- already does. The value is in the stages being separable: research the
-- topic, pick a hook from patterns that have worked, set a style, then write —
-- and be able to walk back into any stage without losing the others.
create table public.research_script_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  workspace_id uuid not null,
  title text not null default 'New script',
  -- Where it came from, when it came from anywhere.
  video_id uuid references public.research_videos (id) on delete set null,
  idea_id uuid references public.research_ideas (id) on delete set null,
  project_id uuid references public.research_projects (id) on delete set null,
  stage text not null default 'topic'
    check (stage in ('topic', 'research', 'hook', 'style', 'script')),
  topic text,
  research_notes text,
  -- The hooks offered at the hook stage, and the one chosen.
  hook_options jsonb not null default '[]'::jsonb,
  chosen_hook text,
  style_notes text,
  script text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, user_id)
    references public.workspaces (id, owner_id) on delete cascade
);

create index research_script_drafts_workspace_idx
  on public.research_script_drafts (workspace_id, updated_at desc);

alter table public.research_script_drafts enable row level security;

create policy research_script_drafts_select_own on public.research_script_drafts
  for select to authenticated using (user_id = (select auth.uid()));
create policy research_script_drafts_insert_own on public.research_script_drafts
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy research_script_drafts_update_own on public.research_script_drafts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy research_script_drafts_delete_own on public.research_script_drafts
  for delete to authenticated using (user_id = (select auth.uid()));

create trigger research_script_drafts_set_updated_at
  before update on public.research_script_drafts
  for each row execute function public.set_updated_at();
