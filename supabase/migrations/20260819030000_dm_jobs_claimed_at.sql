-- Stale-claim recovery needs to know WHEN a job was claimed: a worker that
-- died mid-send leaves its jobs in `sending`, and the next run must be able
-- to tell "claimed ten minutes ago, the worker is gone" from "claimed just
-- now by the other worker".

alter table public.dm_jobs add column claimed_at timestamptz;

create or replace function public.claim_dm_jobs(batch integer)
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
  set status = 'sending', attempts = j.attempts + 1, claimed_at = now()
  from due
  where j.id = due.id
  returning j.*;
$$;

create index dm_jobs_stale_idx on public.dm_jobs (claimed_at) where status = 'sending';
