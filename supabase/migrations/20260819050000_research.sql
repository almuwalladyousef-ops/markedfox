-- Pillar 3: research and scripting (the "Sandcastles" pillar).
--
-- The idea it is built around: a video's raw view count says almost nothing,
-- because a 2M-view video on a 5M-subscriber channel is a normal day while a
-- 40k-view video on a 3k-subscriber channel is a breakout. What matters is how
-- a video performed against ITS OWN channel's recent baseline. So we watch
-- channels (research_sources), record their videos with stats over time
-- (research_videos), compute each video's multiple of the channel's median
-- (outlier_score), and let the user pull a transcript and generate hooks and
-- scripts from the winners (research_transcripts, research_scripts).
--
-- Tenancy is identical to the rest of the schema: every row carries
-- (workspace_id, user_id) with the composite foreign key onto workspaces, RLS
-- lets a user read and write their own rows, and background sync runs as the
-- service role. Two users watching the same channel each keep their own
-- source row — deliberately, because dedup across tenants would put one
-- tenant's sync failures on another tenant's feed.

-- ── which platforms research can actually read ─────────────────────────────
-- Not every platform has a public content API. YouTube does (Data API v3,
-- plain API key). Instagram has business discovery for public business
-- accounts through a connected account. X charges per read. TikTok's Research
-- API is academic-only, so the only TikTok data available is the connected
-- user's OWN videos via video.list. Snapchat has nothing at all. The enum is
-- deliberately smaller than public.platform to stop a source being created
-- for a platform we cannot read.
create type public.research_platform as enum ('youtube', 'instagram', 'x', 'tiktok');

-- ── a watched channel / account ────────────────────────────────────────────
create table public.research_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  workspace_id uuid not null,
  platform public.research_platform not null,
  -- The platform's own id (YouTube channel id UC…, IG user id, X user id).
  external_id text not null,
  handle text,
  title text not null,
  thumbnail_url text,
  follower_count bigint,
  -- Instagram business discovery and TikTok video.list both read through a
  -- connected account's token; YouTube reads with a plain API key and leaves
  -- this null. Set null rather than cascade-deleting the source, so the feed
  -- survives a disconnect and simply stops syncing.
  connection_id uuid references public.connections (id) on delete set null,
  -- Median views across the recent window, recomputed on every sync. Stored
  -- so a listing page can rank without recomputing over every video row.
  baseline_views bigint,
  baseline_sample integer not null default 0,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One row per channel per workspace: adding the same channel twice is a
  -- no-op update, not a duplicate feed.
  unique (workspace_id, platform, external_id),
  foreign key (workspace_id, user_id)
    references public.workspaces (id, owner_id) on delete cascade
);

create index research_sources_workspace_idx
  on public.research_sources (workspace_id, created_at desc);
create index research_sources_stale_idx
  on public.research_sources (last_synced_at nulls first);

alter table public.research_sources enable row level security;

create policy research_sources_select_own on public.research_sources
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy research_sources_insert_own on public.research_sources
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy research_sources_update_own on public.research_sources
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy research_sources_delete_own on public.research_sources
  for delete to authenticated
  using (user_id = (select auth.uid()));

create trigger research_sources_set_updated_at
  before update on public.research_sources
  for each row execute function public.set_updated_at();

-- ── the videos we have seen on those channels ──────────────────────────────
create table public.research_videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  workspace_id uuid not null,
  source_id uuid not null references public.research_sources (id) on delete cascade,
  external_id text not null,
  title text not null,
  description text,
  url text not null,
  thumbnail_url text,
  published_at timestamptz,
  duration_seconds integer,
  view_count bigint,
  like_count bigint,
  comment_count bigint,
  -- views ÷ the channel's median at the time of sync. 1.0 = an average video
  -- for this channel, 3.0 = tripled its own baseline. Null until the channel
  -- has enough videos to have a baseline at all.
  outlier_score numeric(10, 3),
  -- The baseline this score was computed against, kept so a score stays
  -- explicable months later when the channel's median has moved.
  baseline_views bigint,
  first_seen_at timestamptz not null default now(),
  stats_updated_at timestamptz not null default now(),
  unique (source_id, external_id),
  foreign key (workspace_id, user_id)
    references public.workspaces (id, owner_id) on delete cascade
);

-- The outlier feed's query: this workspace's videos, best multiple first.
create index research_videos_feed_idx
  on public.research_videos (workspace_id, outlier_score desc nulls last);
create index research_videos_source_idx
  on public.research_videos (source_id, published_at desc);

alter table public.research_videos enable row level security;

create policy research_videos_select_own on public.research_videos
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy research_videos_delete_own on public.research_videos
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ── transcripts, fetched on demand ─────────────────────────────────────────
create table public.research_transcripts (
  video_id uuid primary key references public.research_videos (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  workspace_id uuid not null,
  language text,
  text text not null,
  -- 'captions' = the platform served real captions; 'unavailable' = there are
  -- none to fetch, recorded so we do not retry on every page view.
  origin text not null default 'captions'
    check (origin in ('captions', 'unavailable')),
  fetched_at timestamptz not null default now(),
  foreign key (workspace_id, user_id)
    references public.workspaces (id, owner_id) on delete cascade
);

alter table public.research_transcripts enable row level security;

create policy research_transcripts_select_own on public.research_transcripts
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ── generated hooks and scripts ────────────────────────────────────────────
create table public.research_scripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  workspace_id uuid not null,
  -- Null when the user generated from a topic rather than from a video.
  video_id uuid references public.research_videos (id) on delete set null,
  kind text not null check (kind in ('hooks', 'script', 'outline')),
  topic text,
  output text not null,
  model text,
  credits_spent integer not null default 1,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, user_id)
    references public.workspaces (id, owner_id) on delete cascade
);

create index research_scripts_workspace_idx
  on public.research_scripts (workspace_id, created_at desc);

alter table public.research_scripts enable row level security;

create policy research_scripts_select_own on public.research_scripts
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy research_scripts_delete_own on public.research_scripts
  for delete to authenticated
  using (user_id = (select auth.uid()));
