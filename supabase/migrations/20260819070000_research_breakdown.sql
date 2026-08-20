-- Research, part two: the deconstruction step, and the pipeline around it.
--
-- The first research migration built steps 1, 2 and 4 of the engine — track
-- channels, surface outliers, generate a script. It skipped step 3, which is
-- the one that makes the other three worth anything: BREAKING DOWN WHY A VIDEO
-- WORKED before writing anything from it.
--
-- Without a breakdown, generation is "write me something like this video",
-- which is what a plain prompt already does. With one, generation is "this
-- video opened on a contradiction, held attention with an open loop it did not
-- close until 0:40, and paid it off in the last four seconds — now do that,
-- about my topic". The breakdown is the product; the script is the output.
--
-- Also here: projects (a pipeline for ideas worth acting on) and the source
-- cap that makes competitor tracking a plan limit rather than unlimited.

-- ── the deconstruction of one video ────────────────────────────────────────
create table public.research_breakdowns (
  video_id uuid primary key references public.research_videos (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  workspace_id uuid not null,

  -- The hook, verbatim where a transcript exists: the first thing a viewer
  -- hears, which is what decides whether there is a second thing.
  hook text,
  -- Which recognised hook pattern it is (contradiction, open loop, stakes,
  -- number, direct question, …). Named so patterns can be counted across a
  -- whole feed later — "what actually works in this niche" is a question about
  -- frequency, not about any one video.
  hook_type text,
  -- Why the viewer keeps watching: the open loop, the withheld answer, the
  -- escalating stakes.
  curiosity_loop text,
  -- Beat-by-beat structure, as an ordered array of {label, detail} objects.
  structure jsonb not null default '[]'::jsonb,
  -- Format and visual treatment: talking head, b-roll over VO, screen capture,
  -- text-on-screen density, cut rhythm.
  format_notes text,
  -- The single most transferable thing about it — what to actually copy.
  takeaway text,
  -- Free-form additional observations the model surfaced.
  notes text,

  model text,
  credits_spent integer not null default 1,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, user_id)
    references public.workspaces (id, owner_id) on delete cascade
);

alter table public.research_breakdowns enable row level security;

create policy research_breakdowns_select_own on public.research_breakdowns
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy research_breakdowns_delete_own on public.research_breakdowns
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ── projects: the pipeline from idea to script ─────────────────────────────
create table public.research_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  workspace_id uuid not null,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, user_id)
    references public.workspaces (id, owner_id) on delete cascade
);

create index research_projects_workspace_idx
  on public.research_projects (workspace_id, created_at desc);

alter table public.research_projects enable row level security;

create policy research_projects_select_own on public.research_projects
  for select to authenticated using (user_id = (select auth.uid()));
create policy research_projects_insert_own on public.research_projects
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy research_projects_update_own on public.research_projects
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy research_projects_delete_own on public.research_projects
  for delete to authenticated using (user_id = (select auth.uid()));

create trigger research_projects_set_updated_at
  before update on public.research_projects
  for each row execute function public.set_updated_at();

-- A saved video inside a project, with the state a pipeline needs.
create table public.research_project_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  workspace_id uuid not null,
  project_id uuid not null references public.research_projects (id) on delete cascade,
  video_id uuid not null references public.research_videos (id) on delete cascade,
  -- Where this idea has got to. Deliberately few states: a pipeline with ten
  -- columns is a pipeline nobody updates.
  stage text not null default 'saved'
    check (stage in ('saved', 'scripted', 'filmed', 'published', 'dropped')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Saving the same video into the same project twice is a no-op.
  unique (project_id, video_id),
  foreign key (workspace_id, user_id)
    references public.workspaces (id, owner_id) on delete cascade
);

create index research_project_items_project_idx
  on public.research_project_items (project_id, created_at desc);

alter table public.research_project_items enable row level security;

create policy research_project_items_select_own on public.research_project_items
  for select to authenticated using (user_id = (select auth.uid()));
create policy research_project_items_insert_own on public.research_project_items
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy research_project_items_update_own on public.research_project_items
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy research_project_items_delete_own on public.research_project_items
  for delete to authenticated using (user_id = (select auth.uid()));

create trigger research_project_items_set_updated_at
  before update on public.research_project_items
  for each row execute function public.set_updated_at();

-- ── standalone transcripts ─────────────────────────────────────────────────
-- The transcript downloader works on any pasted link, not only on a video the
-- workspace already tracks — that is the whole point of it being a tool rather
-- than a button on a row. Those transcripts have no research_videos row to
-- hang off, so they live here.
create table public.research_link_transcripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  workspace_id uuid not null,
  platform public.research_platform not null,
  external_id text not null,
  url text not null,
  title text,
  language text,
  text text not null,
  origin text not null default 'captions'
    check (origin in ('captions', 'unavailable')),
  created_at timestamptz not null default now(),
  -- Re-fetching the same video updates rather than piling up.
  unique (workspace_id, platform, external_id),
  foreign key (workspace_id, user_id)
    references public.workspaces (id, owner_id) on delete cascade
);

create index research_link_transcripts_workspace_idx
  on public.research_link_transcripts (workspace_id, created_at desc);

alter table public.research_link_transcripts enable row level security;

create policy research_link_transcripts_select_own on public.research_link_transcripts
  for select to authenticated using (user_id = (select auth.uid()));
create policy research_link_transcripts_insert_own on public.research_link_transcripts
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy research_link_transcripts_delete_own on public.research_link_transcripts
  for delete to authenticated using (user_id = (select auth.uid()));

-- ── generated output gains a home and a source ─────────────────────────────
alter table public.research_scripts
  add column project_id uuid references public.research_projects (id) on delete set null,
  -- The breakdown a script was written from, so "why does this script look
  -- like this" is answerable months later.
  add column from_breakdown boolean not null default false;

-- Hooks generated by the standalone tool belong to no video at all.
alter table public.research_scripts
  drop constraint research_scripts_kind_check;
alter table public.research_scripts
  add constraint research_scripts_kind_check
  check (kind in ('hooks', 'script', 'outline', 'breakdown', 'audit'));

-- ── plan limits: competitor tracking is a tier feature ─────────────────────
-- Sandcastles' tiers differ mainly by how many competitors you may track and
-- how often they refresh. Both are cost: every tracked channel is API quota
-- spent on a schedule, so unlimited tracking at any price is unlimited spend.
update public.plans
set limits = limits
  || jsonb_build_object('research_sources_max', 0)
  || jsonb_build_object('research_refresh_hours', 24)
where id in ('free', 'pro');

update public.plans
set limits = limits
  || jsonb_build_object('research_sources_max', 150)
  || jsonb_build_object('research_refresh_hours', 12)
where id = 'studio';

update public.plans
set limits = limits
  || jsonb_build_object('research_sources_max', null)
  || jsonb_build_object('research_refresh_hours', 1)
where id = 'enterprise';
