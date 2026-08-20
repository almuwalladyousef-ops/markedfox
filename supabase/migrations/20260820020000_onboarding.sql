-- First-run onboarding.
--
-- The thing this fixes: a new account currently lands on a dashboard with
-- nothing connected, no channels tracked, no automations, and no indication of
-- which of those to do first. Everything works and nothing is obvious, which at
-- a hundred signups in one afternoon is the difference between people using the
-- product and people closing the tab.
--
-- Stored per user rather than per workspace: onboarding is about the person
-- learning the product, and they only learn it once.

create table public.onboarding (
  user_id uuid primary key references public.users (id) on delete cascade,
  -- Which steps have been finished. A jsonb set rather than columns, because
  -- steps get added and removed as the product changes and a migration per
  -- step would be absurd for what is a checklist.
  completed jsonb not null default '[]'::jsonb,
  -- Dismissed for good. Somebody who does not want the checklist should be
  -- able to say so once.
  dismissed boolean not null default false,
  -- The three answers that tune what we recommend: how long they have been
  -- making content, roughly how big their audience is, how often they post.
  -- Null throughout is normal — the questions are skippable.
  tenure text,
  audience_size text,
  cadence text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.onboarding enable row level security;

create policy onboarding_select_own on public.onboarding
  for select to authenticated using (user_id = (select auth.uid()));
create policy onboarding_insert_own on public.onboarding
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy onboarding_update_own on public.onboarding
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create trigger onboarding_set_updated_at
  before update on public.onboarding
  for each row execute function public.set_updated_at();
