-- Settings gains panes that need somewhere to write.
--
-- Two columns on the existing users row rather than a new table: both are
-- exactly one value per user, both are read on nearly every page that reads
-- the user at all, and a second table would mean a join to answer "what is
-- this person's avatar".
--
-- `preferences` is deliberately a jsonb blob and not a column per setting.
-- What lives in it is display ordering — which platform's posts come first on
-- the home screen, which post types the filter row offers first — and those
-- are lists whose contents change whenever a platform is added. A column per
-- preference would mean a migration every time somebody wanted a new toggle;
-- an unknown key here is simply ignored by the reader, which is the correct
-- behaviour for a setting that no longer exists.
--
-- Nothing in it is ever load-bearing for access or billing. Those stay in
-- `plans` and `subscriptions`, where a wrong value fails closed.

alter table public.users
  add column if not exists avatar_url text,
  add column if not exists preferences jsonb not null default '{}'::jsonb;

comment on column public.users.preferences is
  'Display preferences only — ordering and similar. Never entitlements.';

-- The existing RLS on public.users already scopes select and update to the
-- user''s own row, so both columns inherit it. Re-stating the policy here
-- would be a second place for it to drift.
