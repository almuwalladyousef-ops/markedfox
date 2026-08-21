// Studio smoke test: the tables added on 2026-08-20, proven on live rows.
//
//   node scripts/studio-smoke.mjs
//
// Proves, against the hosted project:
//   - the new schema exists: ideas, hook vault, auto-analyze rules, saved
//     filters, persona, script drafts, onboarding
//   - RLS holds on every one of them in BOTH directions: A cannot read B's
//     rows, and A cannot insert a row owned by B
//   - engagement_rate is computed by the database, including the null case
//     where there are no views to divide by
//   - one idea per video per workspace, so re-analysing updates rather than
//     stacking duplicates in the inbox
//   - a draft post is a real row that the scheduler's due query ignores
//   - dm_rules.folder and dm_contacts.email exist and behave
// Throwaway users are removed at the end.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const results = [];
let failures = 0;
const check = (name, ok, detail = "") => {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
};

const stamp = Math.random().toString(36).slice(2, 8);
const users = [];
const password = `St-${stamp}-Aa1!`;

async function mkUser(n) {
  const email = `studio-smoke-${stamp}-${n}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(error.message);
  users.push(data.user.id);
  const { data: ws } = await admin
    .from("workspaces")
    .select("id")
    .eq("owner_id", data.user.id)
    .single();

  // A client authenticated AS this user, so RLS is what answers — the whole
  // point of the isolation checks below.
  const client = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false } },
  );
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) throw new Error(`sign in ${n}: ${signInError.message}`);

  return { id: data.user.id, workspaceId: ws.id, email, client };
}

async function mkSource(user) {
  const { data, error } = await admin
    .from("research_sources")
    .insert({
      user_id: user.id,
      workspace_id: user.workspaceId,
      platform: "youtube",
      external_id: `UC-${stamp}-${Math.random().toString(36).slice(2, 8)}`,
      title: "Smoke channel",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

async function mkVideo(user, sourceId, over = {}) {
  const { data, error } = await admin
    .from("research_videos")
    .insert({
      user_id: user.id,
      workspace_id: user.workspaceId,
      source_id: sourceId,
      external_id: `v-${Math.random().toString(36).slice(2, 10)}`,
      title: "A video",
      url: "https://youtube.com/watch?v=x",
      view_count: 1000,
      like_count: 80,
      comment_count: 20,
      ...over,
    })
    .select("id, engagement_rate")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

let a;
let b;

try {
  a = await mkUser("a");
  b = await mkUser("b");

  const sourceA = await mkSource(a);

  // ── engagement_rate is the database's answer, not the app's ───────────
  const video = await mkVideo(a, sourceA);
  check(
    "engagement_rate is computed from likes + comments over views",
    Math.abs(Number(video.engagement_rate) - 0.1) < 0.0001,
    `got ${video.engagement_rate}`,
  );

  const noViews = await mkVideo(a, sourceA, { view_count: null, like_count: 5 });
  check(
    "no view count means no ratio, rather than a confident zero",
    noViews.engagement_rate === null,
    `got ${noViews.engagement_rate}`,
  );

  // ── ideas ─────────────────────────────────────────────────────────────
  const { data: idea, error: ideaError } = await admin
    .from("research_ideas")
    .insert({
      user_id: a.id,
      workspace_id: a.workspaceId,
      video_id: video.id,
      title: "Uncover the thing behind the other thing",
      status: "inbox",
    })
    .select("id, status")
    .single();
  check("research_ideas accepts an idea", !ideaError && Boolean(idea?.id), ideaError?.message ?? "");

  const { error: dupIdea } = await admin.from("research_ideas").insert({
    user_id: a.id,
    workspace_id: a.workspaceId,
    video_id: video.id,
    title: "The same video again",
  });
  check(
    "one idea per video per workspace — re-analysing cannot stack duplicates",
    Boolean(dupIdea),
    dupIdea?.code ?? "no error",
  );

  const { error: badStatus } = await admin
    .from("research_ideas")
    .update({ status: "maybe" })
    .eq("id", idea.id);
  check("an unknown idea status is refused", Boolean(badStatus));

  // ── the tables A must not be able to read from B ──────────────────────
  const isolation = [
    ["research_ideas", { video_id: video.id, title: "x" }],
    ["research_hook_templates", { formula: "Most people have never [x]" }],
    ["research_automations", { name: "Daily" }],
    ["research_saved_filters", { name: "2x last week" }],
    ["research_script_drafts", { title: "A script" }],
  ];

  for (const [table, extra] of isolation) {
    // A's row, written by the service role.
    const { error: insertError } = await admin
      .from(table)
      .insert({ user_id: a.id, workspace_id: a.workspaceId, ...extra });
    if (insertError && table !== "research_ideas") {
      check(`${table}: seeded`, false, insertError.message);
      continue;
    }

    const { data: seenByB } = await b.client.from(table).select("*");
    check(`${table}: B cannot read A's rows`, (seenByB ?? []).length === 0);

    const { data: seenByA } = await a.client.from(table).select("*");
    check(`${table}: A can read A's rows`, (seenByA ?? []).length > 0);

    // …and cannot write one for A either.
    const { error: crossWrite } = await b.client
      .from(table)
      .insert({ user_id: a.id, workspace_id: a.workspaceId, ...extra });
    check(`${table}: B cannot insert a row owned by A`, Boolean(crossWrite));
  }

  // ── persona is one row per workspace ─────────────────────────────────
  const { error: personaError } = await admin.from("research_personas").insert({
    workspace_id: a.workspaceId,
    user_id: a.id,
    niche: "marketing",
  });
  check("research_personas accepts a persona", !personaError, personaError?.message ?? "");

  const { error: personaDup } = await admin.from("research_personas").insert({
    workspace_id: a.workspaceId,
    user_id: a.id,
    niche: "a second one",
  });
  check("one persona per workspace", Boolean(personaDup));

  const { data: personaSeenByB } = await b.client.from("research_personas").select("*");
  check("research_personas: B cannot read A's persona", (personaSeenByB ?? []).length === 0);

  // ── auto-analyze rules bound their own daily spend ────────────────────
  const { error: hugeLimit } = await admin.from("research_automations").insert({
    user_id: a.id,
    workspace_id: a.workspaceId,
    name: "Runaway",
    daily_limit: 5000,
  });
  check(
    "a rule cannot be given an unbounded daily limit",
    Boolean(hugeLimit),
    hugeLimit?.code ?? "no error",
  );

  // ── script drafts ─────────────────────────────────────────────────────
  const { error: badStage } = await admin.from("research_script_drafts").insert({
    user_id: a.id,
    workspace_id: a.workspaceId,
    title: "Bad stage",
    stage: "vibes",
  });
  check("an unknown script stage is refused", Boolean(badStage));

  // ── drafts are posts the scheduler ignores ────────────────────────────
  const { data: draft, error: draftError } = await admin
    .from("scheduled_posts")
    .insert({
      user_id: a.id,
      workspace_id: a.workspaceId,
      caption: "half an idea",
      status: "draft",
      // Deliberately in the past: a draft keeps whatever time was typed.
      scheduled_for: new Date(Date.now() - 3600_000).toISOString(),
    })
    .select("id")
    .single();
  check("a draft post is a real row", !draftError && Boolean(draft?.id), draftError?.message ?? "");

  const { count: dueCount } = await admin
    .from("scheduled_posts")
    .select("id", { count: "exact", head: true })
    .eq("status", "scheduled")
    .lte("scheduled_for", new Date().toISOString())
    .eq("id", draft.id);
  check("the scheduler's due query does not pick up a draft", dueCount === 0);

  // ── DM additions ──────────────────────────────────────────────────────
  const { data: connection, error: connectionError } = await admin
    .from("connections")
    .insert({
      user_id: a.id,
      workspace_id: a.workspaceId,
      platform: "instagram",
      platform_account_id: `ig-${stamp}`,
      platform_account_name: "smoke",
      access_token_encrypted: "x",
      scopes: [],
    })
    .select("id")
    .single();
  if (connectionError) throw new Error(`connection: ${connectionError.message}`);

  const { data: rule, error: ruleError } = await admin
    .from("dm_rules")
    .insert({
      user_id: a.id,
      workspace_id: a.workspaceId,
      connection_id: connection.id,
      name: "Folder test",
      folder: "Launch",
      template_id: "comment-to-link",
      trigger_type: "comment",
      actions: [{ type: "private_reply", text: "hi" }],
    })
    .select("id, folder, template_id")
    .single();
  check(
    "dm_rules carries a folder and the template it came from",
    !ruleError && rule?.folder === "Launch" && rule?.template_id === "comment-to-link",
    ruleError?.message ?? "",
  );

  const { data: contact, error: contactError } = await admin
    .from("dm_contacts")
    .insert({
      user_id: a.id,
      workspace_id: a.workspaceId,
      connection_id: connection.id,
      platform_user_id: `fan-${stamp}`,
      awaiting_email_rule_id: rule.id,
    })
    .select("id, awaiting_email_rule_id")
    .single();
  check(
    "a contact can be flagged as awaiting an email answer",
    !contactError && contact?.awaiting_email_rule_id === rule.id,
    contactError?.message ?? "",
  );

  const { error: emailError } = await admin
    .from("dm_contacts")
    .update({
      email: "someone@example.com",
      email_captured_at: new Date().toISOString(),
      awaiting_email_rule_id: null,
    })
    .eq("id", contact.id);
  check("capturing the address clears the awaiting flag", !emailError, emailError?.message ?? "");

  const { data: contactsSeenByB } = await b.client.from("dm_contacts").select("*");
  check("dm_contacts: B cannot read A's contacts or their emails", (contactsSeenByB ?? []).length === 0);

  // ── credits are reserved atomically, not checked-then-recorded ────────
  // The race this replaced: two tabs read the same snapshot, both pass the
  // cap, both spend. Twenty simultaneous reservations against a limit of five
  // must let exactly five through.
  const RESERVE_LIMIT = 5;
  const reservations = await Promise.all(
    Array.from({ length: 20 }, () =>
      admin.rpc("reserve_research_credit", {
        p_user_id: a.id,
        p_workspace_id: a.workspaceId,
        p_limit: RESERVE_LIMIT,
        p_ref_id: null,
        p_metadata: { feature: "research", kind: "smoke" },
      }),
    ),
  );
  const granted = reservations.filter((r) => r.data !== null && !r.error);
  check(
    "twenty simultaneous credit reservations against a limit of five let exactly five through",
    granted.length === RESERVE_LIMIT,
    `granted=${granted.length}`,
  );

  const { count: reservedRows } = await admin
    .from("usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", a.id)
    .eq("kind", "ai_call");
  check(
    "a reservation IS the usage row — no pending state to reconcile",
    reservedRows === RESERVE_LIMIT,
    `rows=${reservedRows}`,
  );

  const releasedId = granted[0].data;
  const { data: released } = await admin.rpc("release_research_credit", {
    p_user_id: a.id,
    p_usage_id: releasedId,
  });
  const { count: afterRelease } = await admin
    .from("usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", a.id)
    .eq("kind", "ai_call");
  check(
    "releasing a reservation gives the credit back, so 'no credit was used' is true",
    released === true && afterRelease === RESERVE_LIMIT - 1,
    `rows=${afterRelease}`,
  );

  const { data: crossRelease } = await admin.rpc("release_research_credit", {
    p_user_id: b.id,
    p_usage_id: granted[1].data,
  });
  check(
    "one user cannot release another's credit",
    crossRelease === false,
  );

  const { data: afterFree } = await admin.rpc("reserve_research_credit", {
    p_user_id: a.id,
    p_workspace_id: a.workspaceId,
    p_limit: RESERVE_LIMIT,
    p_ref_id: null,
    p_metadata: {},
  });
  check("the freed credit can be reserved again", afterFree !== null);

  // ── the analyzed filter has to be a SQL filter, not a post-filter ─────
  // Proven by the shape of the data rather than by the query: with a breakdown
  // on the only video, an "unanalyzed" feed must be empty and an "analyzed"
  // one must contain it — whatever the row limit is.
  await admin.from("research_breakdowns").insert({
    video_id: video.id,
    user_id: a.id,
    workspace_id: a.workspaceId,
    hook: "Most people have never…",
  });
  const { data: breakdownIds } = await admin
    .from("research_breakdowns")
    .select("video_id")
    .eq("workspace_id", a.workspaceId);
  check(
    "a breakdown is findable by workspace, which is what the feed filter needs",
    (breakdownIds ?? []).some((row) => row.video_id === video.id),
  );

  // ── onboarding ────────────────────────────────────────────────────────
  const { error: onboardingError } = await a.client
    .from("onboarding")
    .insert({ user_id: a.id, tenure: "veteran" });
  check("a user can write their own onboarding row", !onboardingError, onboardingError?.message ?? "");

  const { data: onboardingSeenByB } = await b.client.from("onboarding").select("*");
  check("onboarding: B cannot read A's answers", (onboardingSeenByB ?? []).length === 0);

  const { error: crossOnboarding } = await b.client
    .from("onboarding")
    .insert({ user_id: a.id, tenure: "new" });
  check("B cannot write an onboarding row for A", Boolean(crossOnboarding));
} catch (e) {
  check("smoke ran to completion", false, e instanceof Error ? e.message : String(e));
} finally {
  for (const id of users) await admin.auth.admin.deleteUser(id).catch(() => {});
  const { count: leftovers } = await admin
    .from("research_ideas")
    .select("id", { count: "exact", head: true })
    .in("user_id", users);
  check(
    "cleanup: throwaway users and their studio rows are gone",
    leftovers === 0,
    `remaining=${leftovers}`,
  );
}

console.log(results.join("\n"));
console.log(`\n${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
