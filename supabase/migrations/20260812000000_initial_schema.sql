-- MarkedFox initial schema.
--
-- Tenancy model: RLS on every table is the isolation mechanism — the database
-- refuses other users' rows, so a route that forgets to scope fails closed.
-- The service_role client (BYPASSRLS) is reserved for the payment webhook and
-- background jobs. Tables where a command has no policy deny that command to
-- authenticated users.
--
-- Defense in depth: workspaces carries unique (id, owner_id), and every tenant
-- child table declares a composite foreign key (workspace_id, user_id) →
-- workspaces (id, owner_id). A row pointing at a workspace its user does not
-- own is refused by the database itself, even under service-role bugs.

-- ─────────────────────────────────────────────────────────────── enums ──

create type public.platform as enum
  ('instagram', 'x', 'threads', 'facebook', 'tiktok', 'youtube', 'linkedin', 'pinterest');

create type public.connection_status as enum
  ('active', 'expired', 'revoked', 'error');

create type public.post_status as enum
  ('draft', 'scheduled', 'publishing', 'published', 'partial', 'failed', 'canceled');

create type public.publish_outcome as enum
  ('published', 'failed');

create type public.dm_trigger_type as enum
  ('comment', 'dm_keyword', 'story_reply', 'new_follower');

create type public.usage_kind as enum
  ('post_publish', 'x_post', 'dm_send', 'video_upload', 'ai_call');

create type public.subscription_status as enum
  ('active', 'trialing', 'past_due', 'canceled', 'incomplete');

-- ───────────────────────────────────────────────────────────── helpers ──

create function public.set_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────── users ──
-- Mirror of auth.users, populated by the signup trigger below.

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.users enable row level security;

create policy users_select_own on public.users
  for select to authenticated
  using (id = (select auth.uid()));

create policy users_update_own on public.users
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- No insert policy (signup trigger only) and no delete policy (cascades from
-- auth.users) — both denied to authenticated.

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────────────────── workspaces ──
-- Single-owner workspaces. Multi-seat is a future workspace_members
-- migration; child tables already carry workspace_id separately from user_id
-- to make that possible without rework.

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users (id) on delete cascade,
  name text not null default 'My workspace',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create index workspaces_owner_id_idx on public.workspaces (owner_id);

alter table public.workspaces enable row level security;

create policy workspaces_select_own on public.workspaces
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy workspaces_insert_own on public.workspaces
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy workspaces_update_own on public.workspaces
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy workspaces_delete_own on public.workspaces
  for delete to authenticated
  using (owner_id = (select auth.uid()));

create trigger workspaces_set_updated_at
  before update on public.workspaces
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────── plans ──
-- Global reference data. The limits jsonb is the entire entitlement contract
-- (parsed by src/lib/entitlements/types.ts). Convention: null = unlimited.
-- Raising a cap for one account is a row edit, never code.

create table public.plans (
  id text primary key,
  name text not null,
  price_monthly_cents integer not null default 0,
  price_annual_cents integer,
  is_public boolean not null default true,
  limits jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.plans enable row level security;

create policy plans_select_all on public.plans
  for select to anon, authenticated
  using (true);

-- No write policies: only service_role edits plans.

create trigger plans_set_updated_at
  before update on public.plans
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────── subscriptions ──
-- Current-state row per user; payment history lives in the processor. The
-- processor's only job is writing this table via webhook (service_role).
-- processor is text, not an enum: 'stripe' today, 'apple' and 'google' when
-- the native apps ship IAP — swapping processors is one adapter file.

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users (id) on delete cascade,
  plan_id text not null references public.plans (id),
  status public.subscription_status not null default 'active',
  processor text not null default 'stripe',
  processor_customer_id text,
  processor_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

create policy subscriptions_select_own on public.subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

-- No insert/update/delete policies: the signup trigger (definer) and the
-- payment webhook (service_role) are the only writers.

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ───────────────────────────────────────────────────────── connections ──
-- Encrypted OAuth tokens. platform_account_id discriminates multiple accounts
-- on the same platform for the same user — a hard product requirement.
-- Token columns hold envelopes from src/lib/crypto.ts, never plaintext.

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  workspace_id uuid not null,
  platform public.platform not null,
  platform_account_id text not null,
  platform_account_name text,
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  status public.connection_status not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, workspace_id, platform, platform_account_id),
  foreign key (workspace_id, user_id)
    references public.workspaces (id, owner_id) on delete cascade
);

create index connections_workspace_id_idx on public.connections (workspace_id);
-- The refresh worker's poll: active connections whose tokens are expiring.
create index connections_expiring_idx on public.connections (token_expires_at)
  where status = 'active' and token_expires_at is not null;

alter table public.connections enable row level security;

create policy connections_select_own on public.connections
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy connections_insert_own on public.connections
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy connections_update_own on public.connections
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy connections_delete_own on public.connections
  for delete to authenticated
  using (user_id = (select auth.uid()));

create trigger connections_set_updated_at
  before update on public.connections
  for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────────────── scheduled_posts ──
-- Pending work. Queue-locking columns (locked_at, locked_by) arrive with the
-- Phase 6 job queue; SELECT ... FOR UPDATE SKIP LOCKED needs none up front.
-- target_connection_ids is an array, not a join table — the 9-table budget;
-- referential integrity for targets is validated in app code, an accepted
-- launch-scale trade-off.

create table public.scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  workspace_id uuid not null,
  caption text not null default '',
  media jsonb not null default '[]'::jsonb,
  platform_overrides jsonb not null default '{}'::jsonb,
  target_connection_ids uuid[] not null default '{}',
  status public.post_status not null default 'draft',
  scheduled_for timestamptz,
  published_at timestamptz,
  attempt_count integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, user_id)
    references public.workspaces (id, owner_id) on delete cascade
);

create index scheduled_posts_user_id_idx on public.scheduled_posts (user_id);
create index scheduled_posts_workspace_id_idx on public.scheduled_posts (workspace_id);
-- The scheduler's poll: due scheduled posts.
create index scheduled_posts_due_idx on public.scheduled_posts (scheduled_for)
  where status = 'scheduled';

alter table public.scheduled_posts enable row level security;

create policy scheduled_posts_select_own on public.scheduled_posts
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy scheduled_posts_insert_own on public.scheduled_posts
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy scheduled_posts_update_own on public.scheduled_posts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy scheduled_posts_delete_own on public.scheduled_posts
  for delete to authenticated
  using (user_id = (select auth.uid()));

create trigger scheduled_posts_set_updated_at
  before update on public.scheduled_posts
  for each row execute function public.set_updated_at();

-- ───────────────────────────────────────────────────────────── history ──
-- Append-only publish outcomes, one row per platform attempt. platform is
-- denormalized and post/connection refs are set null on delete so history
-- outlives everything it points at.

create table public.history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  workspace_id uuid not null,
  scheduled_post_id uuid references public.scheduled_posts (id) on delete set null,
  connection_id uuid references public.connections (id) on delete set null,
  platform public.platform not null,
  outcome public.publish_outcome not null,
  platform_post_id text,
  post_url text,
  error text,
  detail jsonb not null default '{}'::jsonb,
  posted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (workspace_id, user_id)
    references public.workspaces (id, owner_id) on delete cascade
);

create index history_user_posted_idx on public.history (user_id, posted_at desc);
create index history_workspace_id_idx on public.history (workspace_id);
create index history_scheduled_post_idx on public.history (scheduled_post_id);

alter table public.history enable row level security;

create policy history_select_own on public.history
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy history_insert_own on public.history
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- No update/delete policies: history is immutable to users.

-- ──────────────────────────────────────────────────────────── dm_rules ──
-- The rules engine's configuration. actions jsonb shape is owned by Phase 4
-- (reply/sequence definitions).

create table public.dm_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  workspace_id uuid not null,
  connection_id uuid not null references public.connections (id) on delete cascade,
  name text not null,
  enabled boolean not null default true,
  trigger_type public.dm_trigger_type not null,
  keywords text[] not null default '{}',
  target_post_ids text[] not null default '{}',
  actions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, user_id)
    references public.workspaces (id, owner_id) on delete cascade
);

create index dm_rules_user_id_idx on public.dm_rules (user_id);
create index dm_rules_workspace_id_idx on public.dm_rules (workspace_id);
create index dm_rules_connection_enabled_idx on public.dm_rules (connection_id)
  where enabled;

alter table public.dm_rules enable row level security;

create policy dm_rules_select_own on public.dm_rules
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy dm_rules_insert_own on public.dm_rules
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy dm_rules_update_own on public.dm_rules
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy dm_rules_delete_own on public.dm_rules
  for delete to authenticated
  using (user_id = (select auth.uid()));

create trigger dm_rules_set_updated_at
  before update on public.dm_rules
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────── usage ──
-- One row per costed action; the source of truth for every cap in canUserDo
-- and for X/AI cost tracking. Hot append table → bigint identity PK. amount
-- is numeric so video minutes can be fractional.

create table public.usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  workspace_id uuid not null,
  kind public.usage_kind not null,
  amount numeric not null default 1 check (amount > 0),
  platform public.platform,
  ref_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  foreign key (workspace_id, user_id)
    references public.workspaces (id, owner_id) on delete cascade
);

-- The cap queries in src/lib/entitlements/snapshot.ts.
create index usage_user_kind_time_idx on public.usage (user_id, kind, occurred_at desc);
create index usage_workspace_kind_time_idx on public.usage (workspace_id, kind, occurred_at desc);

alter table public.usage enable row level security;

create policy usage_select_own on public.usage
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy usage_insert_own on public.usage
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- No update/delete policies: caps cannot be reset by deleting usage rows.

-- ─────────────────────────────────────────────────────── signup trigger ──
-- Every user always has a users row, a default workspace, and a free
-- subscription: the entitlement snapshot is a plain join and a downgrade is a
-- plan_id flip. Inert until Phase 2 auth ships. Email-change sync from
-- auth.users is a Phase 2 addition.

create function public.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );
  insert into public.workspaces (owner_id, name)
  values (new.id, 'My workspace');
  insert into public.subscriptions (user_id, plan_id, status)
  values (new.id, 'free', 'active');
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────── plan seeds ──
-- The pricing table as data. CLAUDE.md-fixed numbers are exact; dm_sends and
-- video minutes are placeholders pending owner sign-off (row edits by
-- design). x_links_allowed is false on every plan: the server-side URL block
-- is a 13x cost control ($0.015 vs $0.20 per X post), never a UI-only check.

insert into public.plans (id, name, price_monthly_cents, price_annual_cents, is_public, limits) values
(
  'free', 'Free', 0, null, true,
  '{
    "posts_per_week": 10,
    "platforms": ["instagram", "tiktok", "youtube"],
    "x_posts_per_month": 0,
    "x_links_allowed": false,
    "dm_rules_max": 1,
    "dm_sends_per_month": 200,
    "video_upload_minutes_per_month": 60,
    "funnels": false,
    "research_credits_per_month": 0
  }'
),
(
  'pro', 'Pro', 2000, 20000, true,
  '{
    "posts_per_week": null,
    "platforms": null,
    "x_posts_per_month": 300,
    "x_links_allowed": false,
    "dm_rules_max": null,
    "dm_sends_per_month": 10000,
    "video_upload_minutes_per_month": 600,
    "funnels": true,
    "research_credits_per_month": 0
  }'
),
(
  -- Not public until pillar 3 (research) ships — it would be identical to Pro.
  'studio', 'Studio', 4900, 49000, false,
  '{
    "posts_per_week": null,
    "platforms": null,
    "x_posts_per_month": 300,
    "x_links_allowed": false,
    "dm_rules_max": null,
    "dm_sends_per_month": 10000,
    "video_upload_minutes_per_month": 600,
    "funnels": true,
    "research_credits_per_month": 100
  }'
),
(
  -- "Contact us": raising a cap for one account is editing their plan row or
  -- pointing their subscription at a bespoke row. No SSO, no contracts.
  'enterprise', 'Enterprise', 0, null, false,
  '{
    "posts_per_week": null,
    "platforms": null,
    "x_posts_per_month": 1000,
    "x_links_allowed": false,
    "dm_rules_max": null,
    "dm_sends_per_month": 100000,
    "video_upload_minutes_per_month": 6000,
    "funnels": true,
    "research_credits_per_month": 1000
  }'
);
