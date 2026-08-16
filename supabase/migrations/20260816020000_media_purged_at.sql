-- Media is transient: the platforms fetch it once at publish time and it is
-- deleted afterwards (CLAUDE.md, "Cloudflare R2 — media, deleted after
-- publish"). Until now nothing deleted it, so every upload accumulated — two
-- posts had already left 109MB of a 10GB free tier behind.
--
-- This column marks a post whose uploaded objects have been removed, so the
-- sweep does not keep re-issuing deletes for posts it has already cleaned.
-- Deliberately a timestamp rather than a boolean: knowing WHEN storage was
-- reclaimed is what makes a storage-growth question answerable later.
--
-- The post's `media` jsonb is left intact on purpose. It records what was
-- posted; the objects behind those URLs are simply gone, and the platform
-- permalinks in `history` are the durable copy.

alter table public.scheduled_posts
  add column if not exists media_purged_at timestamptz;

-- The sweep's poll: posts that still hold objects. Partial index because the
-- overwhelming majority of rows are already purged and never need looking at.
create index if not exists scheduled_posts_unpurged_idx
  on public.scheduled_posts (status, published_at)
  where media_purged_at is null;

comment on column public.scheduled_posts.media_purged_at is
  'When this post''s uploaded media objects were deleted from storage. Null means they may still exist.';
