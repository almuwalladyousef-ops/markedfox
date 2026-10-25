-- The owner's own account, with no limit anyone can reach (owner decision,
-- 2026-10-25: "make my limit no limit").
--
-- These four fields are required numbers in parsePlanLimits — null throws —
-- so "unlimited" is a number no month can reach rather than null. Everything
-- that accepts null on this plan already is null.
--
-- x_posts_per_month was deliberately 100,000 so a runaway loop cost a bounded
-- amount (X bills $0.015 a post, $0.20 with a link). The owner chose to lift
-- that bound for their own account; it still applies to every paid plan.
--
-- research_refresh_hours stays at 1: it is how often tracked channels are
-- re-read, not a cap, and a shorter interval only burns the shared YouTube
-- quota faster.
update public.plans
set limits = limits || jsonb_build_object(
  'x_posts_per_month', 1000000000,
  'dm_sends_per_month', 1000000000,
  'research_credits_per_month', 1000000000,
  'video_upload_minutes_per_month', 1000000000
)
where id = 'owner';
