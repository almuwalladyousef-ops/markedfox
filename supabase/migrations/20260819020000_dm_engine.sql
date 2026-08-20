-- Phase 4: the DM and comment automation engine.
--
-- Shape of the thing: a webhook lands (webhook_events, deduplicated by the
-- platform's own event id), the matcher turns it into sends (dm_jobs, a
-- Postgres-backed queue claimed with FOR UPDATE SKIP LOCKED), a worker
-- delivers them through the platform adapter and writes a usage row per
-- send, and every step leaves a dm_events row so a rule can report
-- triggered / sent / clicked without a second system. dm_contacts remembers
-- who has talked to which account, which is what Meta's 24-hour messaging
-- window is measured against; dm_links are the tracked redirects.
--
-- Tenancy: every tenant table carries (workspace_id, user_id) with the same
-- composite foreign key as the rest of the schema, and RLS lets a user read
-- their own rows. Writes to the engine's tables are service-role only — the
-- engine runs from webhooks and the scheduler, never from a browser.

-- ── rules: room for per-rule settings without a migration each time ────────
alter table public.dm_rules
  add column config jsonb not null default '{}'::jsonb;

-- ── inbound events, deduplicated ───────────────────────────────────────────
create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  platform public.platform not null,
  -- The platform's own id for the event (comment id, message id). Two
  -- deliveries of the same event collide here and the second is dropped.
  external_id text not null,
  kind text not null check (kind in ('comment', 'message', 'postback', 'other')),
  -- Which account on the platform the event belongs to (the IG user id).
  platform_account_id text not null,
  payload jsonb not null,
  status text not null default 'received'
    check (status in ('received', 'processed', 'ignored', 'failed')),
  attempts integer not null default 0,
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (platform, external_id)
);

create index webhook_events_pending_idx on public.webhook_events (received_at)
  where status = 'received';

alter table public.webhook_events enable row level security;
-- No policies: service role only. Events are matched to tenants by the
-- engine, never read by a browser.

-- ── contacts: who has talked to which connected account ───────────────────
create table public.dm_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  workspace_id uuid not null,
  connection_id uuid not null references public.connections (id) on delete cascade,
  -- The platform-scoped id of the person (Instagram IGSID).
  platform_user_id text not null,
  username text,
  name text,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, platform_user_id),
  foreign key (workspace_id, user_id)
    references public.workspaces (id, owner_id) on delete cascade
);

create index dm_contacts_connection_idx on public.dm_contacts (connection_id, last_inbound_at desc);

alter table public.dm_contacts enable row level security;

create policy dm_contacts_select_own on public.dm_contacts
  for select to authenticated
  using (user_id = (select auth.uid()));

create trigger dm_contacts_set_updated_at
  before update on public.dm_contacts
  for each row execute function public.set_updated_at();

-- ── the send queue ─────────────────────────────────────────────────────────
create table public.dm_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  workspace_id uuid not null,
  connection_id uuid not null references public.connections (id) on delete cascade,
  rule_id uuid references public.dm_rules (id) on delete set null,
  contact_id uuid references public.dm_contacts (id) on delete cascade,
  -- private_reply: the one DM Meta allows in answer to a comment;
  -- message:       a DM inside the 24-hour window (follow-ups, keyword replies);
  -- comment_reply: a public reply under the comment.
  kind text not null check (kind in ('private_reply', 'message', 'comment_reply')),
  payload jsonb not null,
  -- One send per (rule, triggering event, step): a replayed webhook or a
  -- re-run matcher lands on the same key and inserts nothing.
  dedupe_key text not null unique,
  run_at timestamptz not null default now(),
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  last_error text,
  platform_message_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  foreign key (workspace_id, user_id)
    references public.workspaces (id, owner_id) on delete cascade
);

create index dm_jobs_due_idx on public.dm_jobs (run_at) where status = 'pending';
create index dm_jobs_sending_idx on public.dm_jobs (run_at) where status = 'sending';
create index dm_jobs_rule_idx on public.dm_jobs (rule_id, created_at desc);

alter table public.dm_jobs enable row level security;

create policy dm_jobs_select_own on public.dm_jobs
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Claim due jobs: the SELECT … FOR UPDATE SKIP LOCKED the brief calls for,
-- so two workers (a webhook-triggered drain and the scheduler tick) never
-- send the same DM. Security definer so it can be called through the REST
-- RPC surface; revoked from every browser role.
create function public.claim_dm_jobs(batch integer)
returns setof public.dm_jobs
language sql
security definer
set search_path = public
as $$
  with due as (
    select id
    from public.dm_jobs
    where status = 'pending' and run_at <= now()
    order by run_at
    limit batch
    for update skip locked
  )
  update public.dm_jobs j
  set status = 'sending', attempts = j.attempts + 1
  from due
  where j.id = due.id
  returning j.*;
$$;

revoke all on function public.claim_dm_jobs(integer) from public;
revoke all on function public.claim_dm_jobs(integer) from anon;
revoke all on function public.claim_dm_jobs(integer) from authenticated;

-- ── events: the analytics ledger ───────────────────────────────────────────
create table public.dm_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  workspace_id uuid not null,
  rule_id uuid references public.dm_rules (id) on delete cascade,
  job_id uuid references public.dm_jobs (id) on delete set null,
  contact_id uuid references public.dm_contacts (id) on delete set null,
  kind text not null
    check (kind in ('triggered', 'sent', 'failed', 'skipped', 'clicked', 'tapped', 'replied')),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  foreign key (workspace_id, user_id)
    references public.workspaces (id, owner_id) on delete cascade
);

create index dm_events_rule_kind_idx on public.dm_events (rule_id, kind, occurred_at desc);
create index dm_events_user_time_idx on public.dm_events (user_id, occurred_at desc);

alter table public.dm_events enable row level security;

create policy dm_events_select_own on public.dm_events
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ── tracked links ──────────────────────────────────────────────────────────
create table public.dm_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  user_id uuid not null references public.users (id) on delete cascade,
  workspace_id uuid not null,
  rule_id uuid references public.dm_rules (id) on delete cascade,
  job_id uuid references public.dm_jobs (id) on delete set null,
  contact_id uuid references public.dm_contacts (id) on delete set null,
  destination_url text not null,
  clicks integer not null default 0,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, user_id)
    references public.workspaces (id, owner_id) on delete cascade
);

alter table public.dm_links enable row level security;

create policy dm_links_select_own on public.dm_links
  for select to authenticated
  using (user_id = (select auth.uid()));
