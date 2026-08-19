-- Snapchat joins the platform set (owner request, 2026-08-19).
--
-- Snap's Public Profile API posts to Spotlight and Public Stories for
-- approved apps, and — like every platform except X — costs $0 per post, so
-- by pricing rule 1 it can sit in Free. It is added to Free's list here;
-- pulling it back to paid-only is a row edit, never code.
--
-- Postgres 12+ allows ADD VALUE inside a transaction as long as the same
-- transaction never *uses* the new value. Nothing below casts to the enum —
-- plans.limits stores platform ids as jsonb strings — so this stays one
-- migration.

alter type public.platform add value if not exists 'snapchat' after 'youtube';

update public.plans
set limits = jsonb_set(
  limits,
  '{platforms}',
  (limits -> 'platforms') || '["snapchat"]'::jsonb
)
where id = 'free'
  and limits -> 'platforms' is not null
  and limits -> 'platforms' != 'null'::jsonb
  and not (limits -> 'platforms') ? 'snapchat';
