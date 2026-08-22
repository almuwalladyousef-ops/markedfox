-- The home screen: every connected account as its own platform sees it.
--
-- The first thing a person sees when they open MarkedFox should be their own
-- work — followers and posts across every account at once, then the same grid
-- narrowed to one platform. That means reading each platform's own profile and
-- media endpoints, which are slow, rate-limited per app, and in X's case billed
-- per request. So the reads are cached here and refreshed on a schedule rather
-- than run on every page load.
--
-- Two tables, both plain caches: nothing here is a source of truth, and losing
-- the whole cache costs one refresh. Tenancy is identical to every other table
-- — (workspace_id, user_id) with the composite foreign key onto workspaces, RLS
-- for the user's own rows, and the background sweep running as the service role.

-- ── one row per connected account ──────────────────────────────────────────
create table public.account_profiles (
  -- The connection IS the identity here: one profile per connected account,
  -- gone the moment the account is disconnected.
  connection_id uuid primary key
    references public.connections (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  workspace_id uuid not null,
  platform public.platform not null,
  handle text,
  display_name text,
  avatar_url text,
  bio text,
  profile_url text,
  -- null is not zero: it means the platform does not expose the number, and
  -- the screen shows "—" rather than claiming an account has no followers.
  followers bigint,
  following bigint,
  post_count bigint,
  -- What the number on a card means for this platform. Instagram business
  -- reads carry likes; TikTok and YouTube carry views. Stored per row so the
  -- grid can label a mixed feed honestly.
  primary_metric text not null default 'views'
    check (primary_metric in ('views', 'likes')),
  last_synced_at timestamptz,
  -- The platform's own sentence when a read failed — usually a missing scope
  -- on a connection authorized before insights existed, which the screen turns
  -- into "reconnect to include stats".
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, user_id)
    references public.workspaces (id, owner_id) on delete cascade
);

create index account_profiles_workspace_idx
  on public.account_profiles (workspace_id);
-- The sweep's poll: the least recently synced profiles first, never-synced
-- ones ahead of everything.
create index account_profiles_stale_idx
  on public.account_profiles (last_synced_at nulls first);

alter table public.account_profiles enable row level security;

create policy account_profiles_select_own on public.account_profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy account_profiles_insert_own on public.account_profiles
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy account_profiles_update_own on public.account_profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy account_profiles_delete_own on public.account_profiles
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ── the grid ───────────────────────────────────────────────────────────────
-- Every recent post on every connected account, including posts that were
-- never made through MarkedFox. That is the point: the home screen is the
-- user's account, not our record of what we published for them.
create table public.account_media (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null
    references public.connections (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  workspace_id uuid not null,
  platform public.platform not null,
  external_id text not null,
  -- The three shapes a feed filters by, which is all a person wants from the
  -- tabs: short videos, photos, and posts that are only words.
  kind text not null check (kind in ('video', 'photo', 'text')),
  caption text,
  permalink text,
  thumbnail_url text,
  views bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  posted_at timestamptz,
  synced_at timestamptz not null default now(),
  -- Re-reading a platform updates counts in place instead of duplicating the
  -- post, so a grid never shows the same video twice with different views.
  unique (connection_id, external_id),
  foreign key (workspace_id, user_id)
    references public.workspaces (id, owner_id) on delete cascade
);

-- The feed's one query: this workspace, newest first, optionally narrowed by
-- platform or kind. Postgres does the filtering, so paging counts the rows the
-- person asked for.
create index account_media_feed_idx
  on public.account_media (workspace_id, posted_at desc nulls last);
create index account_media_platform_idx
  on public.account_media (workspace_id, platform, posted_at desc nulls last);
create index account_media_kind_idx
  on public.account_media (workspace_id, kind, posted_at desc nulls last);
create index account_media_connection_idx
  on public.account_media (connection_id);

alter table public.account_media enable row level security;

create policy account_media_select_own on public.account_media
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy account_media_insert_own on public.account_media
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy account_media_update_own on public.account_media
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy account_media_delete_own on public.account_media
  for delete to authenticated
  using (user_id = (select auth.uid()));
