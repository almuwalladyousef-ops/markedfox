-- Let a signed-in user write the research rows their own actions produce.
--
-- Four tables shipped in 20260819050000 and 20260819070000 with SELECT and
-- DELETE policies and no INSERT or UPDATE. Every write to them happens in a
-- server action holding the USER's client, so RLS refused all four:
--
--     new row violates row-level security policy for table "research_videos"
--
-- That is not an edge case. It is the whole pillar: syncing a channel, fetching
-- a transcript, running a breakdown, and generating a script are the only four
-- things Studio does, and each is one of these tables. Research has therefore
-- never worked from the UI since it shipped on 2026-08-19.
--
-- It went unnoticed because the scheduler's sweep (lib/research/sweep.ts) uses
-- the service-role client, which bypasses RLS, and the research smoke scripts
-- ran the same way — so they proved the SQL was right and never proved the
-- signed-in user was allowed to run it. A write path exercised only by the
-- service role is a write path nobody has actually tested.
--
-- Scoping is `user_id = auth.uid()` alone, matching every other research table.
-- The workspace does not need naming: each table carries
--   foreign key (workspace_id, user_id) references workspaces (id, owner_id)
-- so a row can only ever name a workspace that same user owns. The database
-- refuses a mismatch before the policy is consulted.

-- ── research_videos: written by a channel sync ─────────────────────────────
create policy research_videos_insert_own on public.research_videos
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- The sync upserts, so re-syncing a channel updates rows it wrote before.
create policy research_videos_update_own on public.research_videos
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ── research_transcripts: fetched on demand from a video page ──────────────
create policy research_transcripts_insert_own on public.research_transcripts
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy research_transcripts_update_own on public.research_transcripts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ── research_scripts: generated output, insert-only by design ──────────────
-- No UPDATE policy on purpose. A generation is a record of what a model said
-- at a moment, and it already has its model name and credit cost stored beside
-- it; editing one in place would make that record a lie. A new generation is a
-- new row, and DELETE already exists for throwing one away.
create policy research_scripts_insert_own on public.research_scripts
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- ── research_breakdowns: step 3, re-runnable on the same video ─────────────
create policy research_breakdowns_insert_own on public.research_breakdowns
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy research_breakdowns_update_own on public.research_breakdowns
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
