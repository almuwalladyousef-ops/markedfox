-- How long a video is, so "Short videos" and "Long videos" can be two tabs
-- instead of one (owner decision, 2026-09-07).
--
-- The home grid could not tell a Reel from a 40-minute upload: `kind` says
-- 'video' for both, and nothing else in the row carries length. A tab that
-- claims to filter by something the data does not hold would just mislabel
-- posts, which is why this is a column and not a UI change.
--
-- Nullable on purpose, and the null means "we do not know" rather than zero:
--
--   * Every row written before this migration has no duration, and inventing
--     one — defaulting to 0, or guessing from the platform — would file real
--     long videos under Short. They stay unknown until the account is next
--     read, which the scheduler's sweep does on its own and the Refresh button
--     does immediately.
--   * Some platforms never report it. A photo or a text post has no duration
--     and never will.
--
-- Consequence the UI has to honour: a video of unknown length appears under
-- All and under neither Short nor Long. Better an incomplete tab than a wrong
-- one — the whole point of the column is not guessing.
alter table public.account_media
  add column if not exists duration_seconds integer
    check (duration_seconds is null or duration_seconds >= 0);

comment on column public.account_media.duration_seconds is
  'Video length in whole seconds. NULL = unknown (not yet re-read, or the platform does not report it). Never 0 as a stand-in for unknown.';

-- The two new tabs are "kind = video AND duration on one side of a threshold",
-- always within one workspace and ordered by posted_at. This is the feed index
-- with duration on the end, so that filter is answered from the index rather
-- than by reading every video row.
create index if not exists account_media_duration_idx
  on public.account_media (workspace_id, kind, duration_seconds, posted_at desc nulls last);
