-- Research credits, reserved atomically.
--
-- Every other metered thing in the product already has this. Publishing has the
-- platform budget's increment-and-check; DM sends are counted before the send.
-- Research credits — the ones that are literally an AI bill — were a read of a
-- snapshot followed, seconds later, by an insert. Two tabs, or one impatient
-- double-click on "Write the script", both read the same count, both pass, and
-- both spend. The cap was advisory.
--
-- The shape that fixes it without lying to the user:
--
--   1. reserve_research_credit() takes an advisory lock on the user, counts the
--      month, and inserts the usage row in one transaction. Over the limit, it
--      returns null and nothing is written.
--   2. The caller makes the model call.
--   3. If that fails, release_research_credit() deletes the row it reserved.
--
-- So the cap is exact, and "no credit was used" stays true when the model does
-- not answer — which is the promise the whole feature's error handling makes.
-- Deliberately not a refund column or a status flag: a usage row that exists
-- means a credit was spent, everywhere in the codebase, and adding a second
-- meaning to it would be worse than the race.

create function public.reserve_research_credit(
  p_user_id uuid,
  p_workspace_id uuid,
  p_limit integer,
  p_ref_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month_start timestamptz := date_trunc('month', now() at time zone 'utc');
  v_used numeric;
  v_id bigint;
begin
  -- Serialise this user's reservations against each other, and nobody else's.
  -- A transaction-scoped advisory lock, so it is released on commit or abort
  -- however this function leaves.
  perform pg_advisory_xact_lock(hashtext('research_credit'), hashtext(p_user_id::text));

  -- The same sum the entitlement snapshot reads: pooled across every workspace
  -- this user owns, because that is how the plan meters it.
  select coalesce(sum(amount), 0) into v_used
  from public.usage
  where user_id = p_user_id
    and kind = 'ai_call'
    and occurred_at >= v_month_start;

  if v_used >= p_limit then
    return null;
  end if;

  insert into public.usage (user_id, workspace_id, kind, amount, ref_id, metadata)
  values (p_user_id, p_workspace_id, 'ai_call', 1, p_ref_id, p_metadata)
  returning id into v_id;

  return v_id;
end;
$$;

-- Give back a reservation whose work never happened. Scoped to the reserving
-- user and to ai_call rows, so a stray id cannot delete somebody's history.
create function public.release_research_credit(
  p_user_id uuid,
  p_usage_id bigint
)
returns boolean
language sql
security definer
set search_path = public
as $$
  with removed as (
    delete from public.usage
    where id = p_usage_id
      and user_id = p_user_id
      and kind = 'ai_call'
    returning id
  )
  select exists (select 1 from removed);
$$;

-- The model's name is only known after it answers, and `usage` has no update
-- policy — deliberately, so a cap cannot be edited away — so the annotation
-- goes through here too.
create function public.annotate_research_credit(
  p_user_id uuid,
  p_usage_id bigint,
  p_metadata jsonb
)
returns boolean
language sql
security definer
set search_path = public
as $$
  with updated as (
    update public.usage
    set metadata = p_metadata
    where id = p_usage_id
      and user_id = p_user_id
      and kind = 'ai_call'
    returning id
  )
  select exists (select 1 from updated);
$$;

-- All three are security definer over `usage`, whose RLS denies inserts,
-- updates and deletes to authenticated users outright. The p_user_id argument is what scopes them,
-- and every caller passes the session's own id.
grant execute on function public.reserve_research_credit(uuid, uuid, integer, uuid, jsonb) to authenticated;
grant execute on function public.release_research_credit(uuid, bigint) to authenticated;
grant execute on function public.annotate_research_credit(uuid, bigint, jsonb) to authenticated;
