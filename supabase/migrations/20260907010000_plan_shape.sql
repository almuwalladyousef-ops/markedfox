-- Owner decisions, 2026-09-07. Four changes to the plan rows and one new
-- limit; no code depends on the new key until the release that reads it, and
-- `parsePlanLimits` treats a missing `drafts` as the generous value, so the
-- running release survives this migration untouched.

-- ── 1. drafts become a ladder, because they cost storage ───────────────────
--
-- A draft holds its media in R2 until it is published or thrown away, which is
-- the same open-ended storage cost that made scheduling a paid feature. But a
-- draft is not only media: a caption is a few hundred bytes and costs nothing
-- to keep. So this is three states rather than a flag.
--
--   'none'  Free. Nothing is stored. Post now, or the composer keeps it only
--           for as long as the tab is open.
--   'text'  Starter. Write ahead as much as you like; the video is what has to
--           wait for a paid plan.
--   'any'   Pro and above.
--
-- One string rather than two booleans on purpose: two flags can contradict
-- each other (no drafts, but media drafts allowed?) and a ladder cannot.
update public.plans set limits = limits || '{"drafts": "none"}'::jsonb
  where id = 'free';
update public.plans set limits = limits || '{"drafts": "text"}'::jsonb
  where id = 'starter';
update public.plans set limits = limits || '{"drafts": "any"}'::jsonb
  where id in ('pro', 'studio', 'enterprise');

-- ── 2. Free gets one workspace, not two ────────────────────────────────────
update public.plans set limits = limits || '{"max_workspaces": 1}'::jsonb
  where id = 'free';

-- ── 3. Free gets every platform except X ───────────────────────────────────
--
-- It had three. The eight here are every platform in the registry that costs
-- us nothing per post; X is the one that bills, so it stays the paid line.
-- Same list as Starter, and it carries the same maintenance note: a platform
-- added to the registry later is not in this list and reads as locked until
-- the row is edited.
update public.plans set limits = limits || jsonb_build_object(
  'platforms',
  '["instagram","facebook","threads","tiktok","youtube","snapchat","linkedin","pinterest"]'::jsonb
) where id = 'free';

-- ── 4. Studio's two metered allowances go up ───────────────────────────────
update public.plans set limits = limits
  || '{"dm_sends_per_month": 15000}'::jsonb
  || '{"x_posts_per_month": 400}'::jsonb
  where id = 'studio';
