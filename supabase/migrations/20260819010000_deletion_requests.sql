-- Deletion requests: the ledger behind Meta's data-deletion callback and the
-- self-serve account deletion.
--
-- Meta POSTs a signed request when a user asks, through Facebook or
-- Instagram, to have their data removed from MarkedFox, and expects back a
-- confirmation code plus a URL where the user can check on it. That status
-- URL has to answer honestly — "received" for a code we never issued is a
-- lie — so every code is written here first and looked up on GET.
--
-- Service-role only: RLS is enabled with no policies, so authenticated users
-- can neither read nor forge entries. The user_id column is deliberately NOT
-- a foreign key — for an account deletion the user row is gone by the time
-- the request is marked completed.

create table public.deletion_requests (
  id uuid primary key default gen_random_uuid(),
  confirmation_code text not null unique,
  -- 'meta' (Facebook/Instagram app), 'threads' (the Threads use case, which
  -- signs with its own secret), or 'account' (self-serve deletion).
  source text not null,
  -- Meta's app-scoped user id for callback-driven requests; null otherwise.
  platform_user_id text,
  user_id uuid,
  status text not null default 'received'
    check (status in ('received', 'completed', 'failed')),
  detail jsonb not null default '{}'::jsonb,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.deletion_requests enable row level security;
