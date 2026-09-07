-- Four changes, all additive to a running release.
--
-- 1. research_videos.media_url — the file Whisper listens to
-- 2. research_transcripts.origin — tell "no captions" apart from "we broke"
-- 3. research_ideas.status gains 'saved' — a plain saved-video list
-- 4. an `owner` plan row with no meaningful limits
--
-- Nothing here renames or drops a column, so the currently-running release
-- keeps serving while the new one builds (CLAUDE.md rule 8).

-- ── 1. the media file, for platforms that serve no captions ───────────────
-- YouTube hands out caption tracks. Instagram does not, but its business
-- discovery media edge already returns `media_url` — a real MP4 — which the
-- provider was fetching and throwing away. Storing it is what makes speech
-- transcription possible at all for that platform.
--
-- Nullable and expected to go stale: Instagram's CDN URLs are signed and
-- expire. That is handled by treating a failed download as a retryable
-- failure rather than as "this video has no words", so the next sync's fresh
-- URL simply works.
alter table public.research_videos
  add column if not exists media_url text;

-- ── 2. why there is no transcript ─────────────────────────────────────────
-- The old constraint was ('captions', 'unavailable'), and that missing
-- distinction is the whole bug this migration accompanies. YouTube's public
-- timedtext endpoint began answering HTTP 200 with an empty body; the fetcher
-- read that as "no captions", stored 'unavailable' so it would never retry,
-- and every breakdown from then on worked from the video's TITLE while
-- reporting nothing wrong. The generated "scripts" were invented.
--
--   captions     the platform served real captions
--   transcribed  we ran the audio through a speech model
--   none         there is genuinely nothing to fetch — safe to cache
--
-- 'failed' is deliberately NOT a storable value. A failure on our side must
-- never be cached, because caching it is precisely what hid the fault.
-- The delete comes BEFORE the new constraint, not after. Postgres validates a
-- CHECK against every existing row at the moment it is added, so adding it
-- first fails on the very rows this migration exists to remove.
--
-- Every existing 'unavailable' row was written by the broken fetcher, so each
-- one is a claim we now know to be untrue. Deleting them lets those videos be
-- fetched properly on next open; keeping them would preserve the bug's effect
-- after the bug was fixed.
alter table public.research_transcripts
  drop constraint if exists research_transcripts_origin_check;

delete from public.research_transcripts where origin = 'unavailable';

alter table public.research_transcripts
  add constraint research_transcripts_origin_check
  check (origin in ('captions', 'transcribed', 'none'));

-- The standalone transcript tool keeps its own table, for links that have no
-- tracked video behind them. Same column, same reasoning, same fix.
alter table public.research_link_transcripts
  drop constraint if exists research_link_transcripts_origin_check;

delete from public.research_link_transcripts where origin = 'unavailable';

alter table public.research_link_transcripts
  add constraint research_link_transcripts_origin_check
  check (origin in ('captions', 'transcribed', 'none'));

-- ── 3. saving a video without judging it ──────────────────────────────────
-- The idea inbox already carries a per-video row with a status, so a saved
-- list is one more status rather than a new table. 'shortlisted' means "I
-- intend to make this"; 'saved' means "keep this where I can find it", which
-- is a different and earlier thought.
alter table public.research_ideas
  drop constraint if exists research_ideas_status_check;

alter table public.research_ideas
  add constraint research_ideas_status_check
  check (status in ('inbox', 'shortlisted', 'discarded', 'saved'));

-- ── 4. the owner's own account ────────────────────────────────────────────
-- Limits are rows, never code (see src/lib/entitlements/types.ts). There is
-- deliberately no `is_admin` column anywhere in this schema: a bypass flag
-- would be a SECOND entitlement path to keep correct forever, and the first
-- one already works. An unlimited account is therefore just a plan nobody can
-- buy.
--
-- x_posts_per_month is the one number here that is real money — X bills
-- $0.015 a post and $0.20 with a link — so it is large rather than null. A
-- runaway loop should cost a bounded amount.
insert into public.plans (id, name, price_monthly_cents, price_annual_cents, is_public, limits)
values (
  'owner',
  'Owner',
  0,
  0,
  false,
  jsonb_build_object(
    'drafts', 'any',
    'funnels', true,
    'platforms', null,
    'scheduling', true,
    'dm_rules_max', null,
    'posts_per_day', null,
    'max_workspaces', null,
    'x_links_allowed', true,
    'x_posts_per_month', 100000,
    'dm_sends_per_month', 1000000,
    'research_sources_max', null,
    'research_refresh_hours', 1,
    'research_credits_per_month', 1000000,
    'video_upload_minutes_per_month', 1000000,
    'max_connected_accounts_per_workspace', null
  )
)
on conflict (id) do update set limits = excluded.limits, is_public = false;
