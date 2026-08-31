-- App-level rate limiting.
--
-- Until now the only limiter in the product was `platform_budgets`, which
-- protects the PLATFORMS from us — Meta and TikTok count per app, so a burst
-- can throttle every tenant at once. Nothing protected US from a caller.
-- That leaves the endpoints that cost real money or guard real secrets open to
-- being hammered:
--
--   * sign-in — password guessing against a known email, at whatever rate the
--     attacker's connection allows;
--   * sign-up and password-reset — free mail sent from our Supabase project's
--     quota to any address an attacker likes, which is how a sending domain
--     gets a spam reputation;
--   * presigned upload URLs — each one is an object an anonymous-ish caller
--     can push bytes into, billed to our R2 account.
--
-- Postgres rather than Redis, deliberately: the box is 1 vCPU / 2GB with no
-- Redis on it, the app already treats Postgres as its queue and its budget
-- ledger, and one more small table is cheaper than one more daemon.
--
-- Fixed window rather than sliding: a sliding log stores one row per attempt,
-- and the failure mode of a fixed window (up to 2x the limit across a window
-- boundary) is irrelevant at the sizes here, where the point is to turn
-- "thousands per minute" into "a handful".

create table public.rate_limits (
  -- Caller-built and opaque to this table: "signin:email:a@b.com",
  -- "upload:user:<uuid>". Building it is the caller's job precisely so the
  -- policy lives in one TypeScript file rather than smeared across SQL.
  key text primary key,
  window_started_at timestamptz not null default now(),
  used integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.rate_limits enable row level security;
-- No policies: service role only, like platform_budgets. This is app-wide
-- infrastructure, not tenant data. A user who could read it would learn
-- whether a given email has been trying to sign in, and one who could write
-- it could clear their own limit.

-- Pruning wants the timestamp, not the key.
create index rate_limits_updated_idx on public.rate_limits (updated_at);

/*
 * Spend `p_cost` against `p_key`, allowed `p_limit` per `p_window_seconds`.
 *
 * Returns one row: allowed, retry_after_seconds when refused, and how much of
 * the window is left afterwards — enough for a caller to render "try again in
 * 40 seconds" without a second query.
 *
 * Atomic by construction, the same way consume_platform_budget is: the
 * INSERT … ON CONFLICT DO UPDATE takes a row lock, so two requests arriving
 * together serialise and cannot both be told yes for the last slot. A refused
 * call spends nothing, so a locked-out caller cannot extend their own lockout
 * by continuing to knock.
 */
create function public.consume_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer,
  p_cost integer default 1
)
returns table (allowed boolean, retry_after_seconds integer, remaining integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_row public.rate_limits%rowtype;
  v_window_ends timestamptz;
begin
  insert into public.rate_limits (key, window_started_at, used, updated_at)
    values (p_key, v_now, 0, v_now)
  on conflict (key) do update
    set updated_at = v_now
  returning * into v_row;

  v_window_ends := v_row.window_started_at + make_interval(secs => p_window_seconds);

  -- Window elapsed: this caller starts a fresh one and owns its first spend.
  if v_now >= v_window_ends then
    update public.rate_limits
      set window_started_at = v_now, used = p_cost, updated_at = v_now
      where key = p_key;
    return query select true, 0, greatest(0, p_limit - p_cost);
    return;
  end if;

  if v_row.used + p_cost <= p_limit then
    update public.rate_limits
      set used = v_row.used + p_cost, updated_at = v_now
      where key = p_key;
    return query select true, 0, greatest(0, p_limit - (v_row.used + p_cost));
    return;
  end if;

  return query
    select false,
           greatest(1, ceil(extract(epoch from (v_window_ends - v_now)))::integer),
           0;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer, integer) from public;
revoke all on function public.consume_rate_limit(text, integer, integer, integer) from anon;
revoke all on function public.consume_rate_limit(text, integer, integer, integer) from authenticated;

/*
 * Forget a key entirely. Called after a SUCCESSFUL sign-in so that somebody
 * who fumbled their password twice and then got it right is not still carrying
 * two-thirds of a lockout — the limiter exists to stop guessing, and a correct
 * password is proof this caller was not guessing.
 */
create function public.reset_rate_limit(p_key text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.rate_limits where key = p_key;
$$;

revoke all on function public.reset_rate_limit(text) from public;
revoke all on function public.reset_rate_limit(text) from anon;
revoke all on function public.reset_rate_limit(text) from authenticated;

/*
 * Drop windows nobody has touched in a while. Called from the scheduler tick,
 * which already sweeps expired media and stale posts; without it this table
 * grows one permanent row per email anybody ever typed into the login form.
 */
create function public.prune_rate_limits(p_older_than_seconds integer default 86400)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  with gone as (
    delete from public.rate_limits
    where updated_at < now() - make_interval(secs => p_older_than_seconds)
    returning 1
  )
  select count(*) into v_deleted from gone;
  return coalesce(v_deleted, 0);
end;
$$;

revoke all on function public.prune_rate_limits(integer) from public;
revoke all on function public.prune_rate_limits(integer) from anon;
revoke all on function public.prune_rate_limits(integer) from authenticated;
