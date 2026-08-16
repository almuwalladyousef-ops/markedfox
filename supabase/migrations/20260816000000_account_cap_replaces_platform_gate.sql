-- Owner decision 2026-08-16: platforms are no longer gated by identity.
--
-- Before: Free could connect only Instagram, TikTok, and YouTube; the other
-- five platforms rendered as "Locked" no matter what.
--
-- After: every plan can connect every platform, and the Free lever is the
-- NUMBER of connected accounts — three, in any mix the user likes. Paid plans
-- are unlimited. This is a better free tier (nobody is told a platform is
-- off-limits) and a cleaner upgrade reason (you ran out of slots).
--
-- X is the one thing that cannot follow this rule. Every other platform costs
-- $0 per post, but X bills per post ($0.015, or $0.20 with a link), so the
-- Free plan keeps x_posts_per_month at 0: connectable, but publishing refused.
-- Otherwise a free user spends real money.

update public.plans
set limits = limits
  || '{"platforms": null}'::jsonb
  || '{"max_connected_accounts": 3}'::jsonb
where id = 'free';

update public.plans
set limits = limits || '{"max_connected_accounts": null}'::jsonb
where id in ('pro', 'studio', 'enterprise');

-- Every plan must carry the key, so parsePlanLimits never sees it missing.
do $$
declare missing text;
begin
  select string_agg(id, ', ') into missing
  from public.plans
  where not (limits ? 'max_connected_accounts');

  if missing is not null then
    raise exception 'plans missing max_connected_accounts: %', missing;
  end if;
end $$;
