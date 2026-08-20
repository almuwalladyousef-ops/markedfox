-- Per-rule analytics for the automations page: one row per (rule, event
-- kind) with a count. SECURITY INVOKER, so RLS on dm_events decides what the
-- caller may see — a user gets their own rules' numbers and nothing else,
-- through the same policy every other read uses.

create function public.dm_rule_stats(p_workspace_id uuid)
returns table (rule_id uuid, kind text, count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select rule_id, kind, count(*)::bigint
  from public.dm_events
  where workspace_id = p_workspace_id and rule_id is not null
  group by rule_id, kind
$$;

grant execute on function public.dm_rule_stats(uuid) to authenticated;
