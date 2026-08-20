-- Phase 6: the shared platform rate-limit budget, and a real claim for the
-- publish queue.
--
-- The thing this exists for: Meta and TikTok rate-limit **per app, not per
-- user**. Every customer, free and paying, spends from one budget that belongs
-- to MarkedFox. So a launch burst of a hundred people connecting and posting in
-- the same hour can get the whole app throttled, and the failure lands on
-- everybody at once — including the users who did nothing. Backing off before
-- the platform does is the only way that is survivable.
--
-- Two mechanisms, both here:
--
--   1. A counter per platform per rolling window. Callers ask for permission
--      before they spend, and the answer is atomic — two workers on the same
--      box, or a webhook drain racing the scheduler tick, cannot both be told
--      yes for the last call in the window.
--
--   2. A `blocked_until` stamp. When a platform actually answers 429, whoever
--      saw it records the fact, and every other caller stops asking until it
--      passes. Without this, a throttled app keeps hammering the endpoint that
--      is throttling it, which is how a short rate-limit becomes a long one.

-- ── the budget ─────────────────────────────────────────────────────────────
create table public.platform_budgets (
  platform public.platform primary key,
  -- Start of the current rolling window. When a caller arrives after the
  -- window has elapsed, the counter resets to that caller's cost.
  window_started_at timestamptz not null default now(),
  used integer not null default 0,
  -- Set when a platform answers 429 (or its own equivalent). Every caller
  -- refuses until it passes, whatever the counter says.
  blocked_until timestamptz,
  last_throttled_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

alter table public.platform_budgets enable row level security;
-- No policies: service role only. This is app-wide infrastructure, not tenant
-- data, and a user must never be able to read how much budget is left (it
-- would leak other tenants' activity) or write to it.

/*
 * Ask to spend `p_cost` of `p_platform`'s budget.
 *
 * Returns one row: allowed, plus retry_after_seconds when refused, so the
 * caller can requeue at a sensible time instead of spinning.
 *
 * Atomic by construction: the INSERT … ON CONFLICT DO UPDATE takes a row lock,
 * so concurrent callers serialise on it and the window reset cannot be applied
 * twice. Refusals leave the counter untouched — a refused call spends nothing.
 */
create function public.consume_platform_budget(
  p_platform public.platform,
  p_cost integer,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_row public.platform_budgets%rowtype;
  v_window_ends timestamptz;
begin
  -- Take (or create) the row and lock it for this transaction.
  insert into public.platform_budgets (platform, window_started_at, used)
    values (p_platform, v_now, 0)
  on conflict (platform) do update
    set updated_at = v_now
  returning * into v_row;

  -- A platform that told us to stop takes precedence over any counter.
  if v_row.blocked_until is not null and v_row.blocked_until > v_now then
    return query select false, greatest(1, ceil(extract(epoch from (v_row.blocked_until - v_now)))::integer);
    return;
  end if;

  v_window_ends := v_row.window_started_at + make_interval(secs => p_window_seconds);

  -- Window elapsed: start a fresh one owned by this caller.
  if v_now >= v_window_ends then
    update public.platform_budgets
      set window_started_at = v_now,
          used = p_cost,
          blocked_until = null,
          updated_at = v_now
      where platform = p_platform;
    return query select true, 0;
    return;
  end if;

  -- Inside the window: spend only if the whole cost fits.
  if v_row.used + p_cost <= p_limit then
    update public.platform_budgets
      set used = v_row.used + p_cost,
          updated_at = v_now
      where platform = p_platform;
    return query select true, 0;
    return;
  end if;

  -- Refused. Come back when the window turns over.
  return query select false, greatest(1, ceil(extract(epoch from (v_window_ends - v_now)))::integer);
end;
$$;

revoke all on function public.consume_platform_budget(public.platform, integer, integer, integer) from public;
revoke all on function public.consume_platform_budget(public.platform, integer, integer, integer) from anon;
revoke all on function public.consume_platform_budget(public.platform, integer, integer, integer) from authenticated;

/*
 * Record that a platform actually throttled us, so every other caller stops.
 * Called with the platform's own Retry-After when it gives one, and a
 * conservative default when it does not.
 */
create function public.record_platform_throttle(
  p_platform public.platform,
  p_retry_after_seconds integer,
  p_error text default null
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_until timestamptz := v_now + make_interval(secs => greatest(1, p_retry_after_seconds));
begin
  insert into public.platform_budgets (platform, window_started_at, used, blocked_until, last_throttled_at, last_error, updated_at)
    values (p_platform, v_now, 0, v_until, v_now, left(p_error, 500), v_now)
  on conflict (platform) do update
    -- Never shorten an existing block: if two workers report a throttle, the
    -- longer one is the one the platform meant.
    set blocked_until = greatest(coalesce(public.platform_budgets.blocked_until, v_until), v_until),
        last_throttled_at = v_now,
        last_error = left(p_error, 500),
        updated_at = v_now;

  return v_until;
end;
$$;

revoke all on function public.record_platform_throttle(public.platform, integer, text) from public;
revoke all on function public.record_platform_throttle(public.platform, integer, text) from anon;
revoke all on function public.record_platform_throttle(public.platform, integer, text) from authenticated;

-- ── the publish queue's claim ──────────────────────────────────────────────
-- Until now the scheduler claimed due posts with a conditional update
-- (`status = 'scheduled'` → `publishing`), which is safe against double-claim
-- but leaves a post stranded in `publishing` forever if the tick dies
-- mid-publish — exactly what happens when the box is restarted during a
-- deploy, or OOMs during a burst. This replaces it with the same
-- FOR UPDATE SKIP LOCKED claim the DM queue uses, plus a lease so a stranded
-- post is recovered rather than lost.

alter table public.scheduled_posts
  add column claimed_at timestamptz;

create index scheduled_posts_claimed_idx on public.scheduled_posts (claimed_at)
  where status = 'publishing';

/*
 * Claim up to `batch` due posts. Skips rows another worker holds, so a
 * webhook-time drain and the scheduler tick never publish the same post twice.
 */
create function public.claim_scheduled_posts(batch integer)
returns setof public.scheduled_posts
language sql
security definer
set search_path = public
as $$
  with due as (
    select id
    from public.scheduled_posts
    where status = 'scheduled' and scheduled_for <= now()
    order by scheduled_for
    limit batch
    for update skip locked
  )
  update public.scheduled_posts p
  set status = 'publishing',
      attempt_count = p.attempt_count + 1,
      claimed_at = now()
  from due
  where p.id = due.id
  returning p.*;
$$;

revoke all on function public.claim_scheduled_posts(integer) from public;
revoke all on function public.claim_scheduled_posts(integer) from anon;
revoke all on function public.claim_scheduled_posts(integer) from authenticated;

/*
 * Recover posts stranded in `publishing` by a worker that died.
 *
 * Returns them to `scheduled` so the next tick picks them up, unless they have
 * already burned through their attempts — those become `failed` with a reason a
 * human can read, rather than retrying forever.
 *
 * The lease has to be generous: a single TikTok PULL_FROM_URL poll can legally
 * run 300 seconds, and reclaiming a post that is still publishing would post it
 * twice — the one failure mode worse than posting it late.
 */
create function public.recover_stranded_posts(
  p_lease_seconds integer,
  p_max_attempts integer
)
returns table (recovered integer, dead_lettered integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz := now() - make_interval(secs => p_lease_seconds);
  v_recovered integer;
  v_dead integer;
begin
  with stranded as (
    select id, attempt_count
    from public.scheduled_posts
    where status = 'publishing'
      and coalesce(claimed_at, updated_at) < v_cutoff
    for update skip locked
  ),
  retried as (
    update public.scheduled_posts p
    set status = 'scheduled', claimed_at = null
    from stranded s
    where p.id = s.id and s.attempt_count < p_max_attempts
    returning p.id
  ),
  died as (
    update public.scheduled_posts p
    set status = 'failed',
        claimed_at = null,
        last_error = 'Publishing was interrupted repeatedly and gave up after '
          || s.attempt_count || ' attempts. Nothing was posted; you can duplicate this post to try again.'
    from stranded s
    where p.id = s.id and s.attempt_count >= p_max_attempts
    returning p.id
  )
  select (select count(*) from retried), (select count(*) from died)
    into v_recovered, v_dead;

  return query select coalesce(v_recovered, 0), coalesce(v_dead, 0);
end;
$$;

revoke all on function public.recover_stranded_posts(integer, integer) from public;
revoke all on function public.recover_stranded_posts(integer, integer) from anon;
revoke all on function public.recover_stranded_posts(integer, integer) from authenticated;
