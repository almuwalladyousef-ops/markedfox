-- The DM engine's second surface: templates, folders, email capture, and the
-- follow-up that only fires when the link went untouched.
--
-- The engine built in Phase 4 answers "a comment arrived, what do we send".
-- What it could not express is the shape every competitor's highest-converting
-- automation actually uses: greet, gate the link behind a tap, and chase the
-- people who never tapped. Each of those is a small addition here and a
-- behaviour in the worker.

-- ── where a rule came from, and where it lives ─────────────────────────────
-- template_id is the id of the starter a rule was built from. Kept because a
-- rule that started as "Auto-DM links from comments" and was then edited is
-- still worth counting as that template when deciding which starters to offer
-- next. Null means built from scratch.
alter table public.dm_rules
  add column template_id text,
  -- Folders are one text column rather than a table on purpose: at a hundred
  -- users, a folder is a label, and a label does not need a join.
  add column folder text;

create index dm_rules_folder_idx on public.dm_rules (workspace_id, folder)
  where folder is not null;

-- ── email capture ──────────────────────────────────────────────────────────
-- An automation that asks for an email has to have somewhere to put it. On the
-- contact rather than in a separate table: one person, one address, and the
-- export a user will eventually ask for is "my contacts", not "my captures".
alter table public.dm_contacts
  add column email text,
  add column email_captured_at timestamptz,
  -- Set while a rule is waiting for the next inbound message to BE the email.
  -- Without this the engine cannot tell an address from any other message.
  add column awaiting_email_rule_id uuid references public.dm_rules (id) on delete set null;

create index dm_contacts_email_idx on public.dm_contacts (workspace_id, email)
  where email is not null;
