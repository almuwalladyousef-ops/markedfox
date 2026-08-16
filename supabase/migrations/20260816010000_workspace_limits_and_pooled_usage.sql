-- Owner model, 2026-08-16: workspaces become a first-class plan limit, and the
-- limits split into two scopes.
--
--   PER WORKSPACE  connected accounts — 3 on Free, unlimited on paid.
--   POOLED         posts, DM sends, DM rules, X posts, video minutes, and
--                  research credits — one budget across every workspace the
--                  user owns, so creating workspaces never multiplies an
--                  allowance.
--
-- Workspaces: Free 2, Pro 5, Studio 10, Enterprise unlimited.
--
-- Platform availability comes back, but as presentation rather than a wall:
-- Free excludes X, LinkedIn, and Pinterest, and the UI renders those as
-- toggles carrying an upgrade badge instead of hiding or "locking" them.
-- X in particular can never be free — it bills per post.

update public.plans
set limits = (limits - 'max_connected_accounts' - 'posts_per_week')
  || jsonb_build_object(
       'posts_per_day', 2,
       'max_connected_accounts_per_workspace', 3,
       'max_workspaces', 2,
       'platforms', '["instagram","facebook","threads","tiktok","youtube"]'::jsonb
     )
where id = 'free';

update public.plans
set limits = (limits - 'max_connected_accounts' - 'posts_per_week')
  || jsonb_build_object(
       'posts_per_day', null,
       'max_connected_accounts_per_workspace', null,
       'max_workspaces', 5,
       'platforms', null
     )
where id = 'pro';

update public.plans
set limits = (limits - 'max_connected_accounts' - 'posts_per_week')
  || jsonb_build_object(
       'posts_per_day', null,
       'max_connected_accounts_per_workspace', null,
       'max_workspaces', 10,
       'platforms', null
     )
where id = 'studio';

update public.plans
set limits = (limits - 'max_connected_accounts' - 'posts_per_week')
  || jsonb_build_object(
       'posts_per_day', null,
       'max_connected_accounts_per_workspace', null,
       'max_workspaces', null,
       'platforms', null
     )
where id = 'enterprise';

-- Workspaces need a name the user chose and a way to order them consistently
-- in a switcher. `is_default` marks the one created at signup so a user always
-- lands somewhere sensible.
alter table public.workspaces
  add column if not exists is_default boolean not null default false;

-- Exactly one default per owner.
create unique index if not exists workspaces_one_default_per_owner
  on public.workspaces (owner_id)
  where is_default;

-- Backfill: the oldest workspace of each owner becomes their default.
update public.workspaces w
set is_default = true
where not exists (
  select 1 from public.workspaces d
  where d.owner_id = w.owner_id and d.is_default
)
and w.id = (
  select id from public.workspaces x
  where x.owner_id = w.owner_id
  order by created_at asc
  limit 1
);

-- The signup trigger should mark the workspace it creates as the default.
create or replace function public.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );
  insert into public.workspaces (owner_id, name, is_default)
  values (new.id, 'My workspace', true);
  insert into public.subscriptions (user_id, plan_id, status)
  values (new.id, 'free', 'active');
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from anon, authenticated;

-- Every plan must carry the new keys, so parsePlanLimits never sees one missing.
do $$
declare missing text;
begin
  select string_agg(id, ', ') into missing
  from public.plans
  where not (limits ? 'max_workspaces')
     or not (limits ? 'max_connected_accounts_per_workspace')
     or not (limits ? 'posts_per_day');

  if missing is not null then
    raise exception 'plans missing new limit keys: %', missing;
  end if;
end $$;
