-- A fourth public tier between Free and Pro (owner decision, 2026-09-03).
--
-- The design constraint is the whole point: Starter must cost essentially
-- nothing to serve. Posting to Instagram, Facebook, Threads, TikTok, YouTube
-- and Snapchat is $0 per post on every one of those APIs, so unlimited posting
-- is genuinely free for us to give away. Everything that is NOT free is
-- excluded:
--
--   X                   bills $0.015 per post ($0.20 with a link)
--   research credits    real AI spend
--   scheduling          a scheduled post's media sits in R2 until the tick
--                       fires, which can be weeks — the one gate in this
--                       product that costs something real per use
--
-- So Starter reads as one honest sentence: unlimited posting, publish now
-- only. Pro keeps scheduling, X, funnels and the bigger DM budget, which is
-- what stops this tier eating it — scheduling is the feature people actually
-- buy a posting tool for.
--
-- Additive only: one new row, no column changes and no edits to existing
-- rows, so the currently-running release survives this migration untouched.
--
-- stripe_price_monthly / stripe_price_annual stay null until the owner creates
-- the product in the Stripe dashboard. startCheckoutAction already refuses a
-- plan with no price id and names the interval, so an unpriced row degrades
-- safely rather than erroring.

insert into public.plans (
  id, name, price_monthly_cents, price_annual_cents, is_public, limits
) values (
  'starter', 'Starter', 800, 8000, true,
  '{
    "posts_per_day": null,
    "max_connected_accounts_per_workspace": null,
    "max_workspaces": 2,
    "platforms": ["instagram", "facebook", "threads", "tiktok", "youtube", "snapchat", "linkedin", "pinterest"],
    "x_posts_per_month": 0,
    "x_links_allowed": false,
    "dm_rules_max": null,
    "dm_sends_per_month": 5000,
    "video_upload_minutes_per_month": 300,
    "scheduling": false,
    "funnels": false,
    "research_credits_per_month": 0,
    "research_sources_max": 0,
    "research_refresh_hours": 24
  }'::jsonb
)
on conflict (id) do nothing;

-- platforms is an explicit list rather than null on purpose. null means EVERY
-- platform, which would hand Starter the one platform that bills us per post.
-- Consequence to remember: a platform added to the registry later is NOT in
-- this list and will read as locked for Starter until this row is edited.
