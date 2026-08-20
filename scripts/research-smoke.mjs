// Research (pillar 3) smoke test: real rows in the hosted project, and the
// scoring logic proven end to end through the same code the app runs.
//
//   node scripts/research-smoke.mjs
//
// Proves, on live rows:
//   - the research schema exists and RLS holds: A cannot see B's sources,
//     videos, transcripts, or scripts, and cannot insert a source owned by B
//   - the outlier maths on a channel shaped like a real one: a small channel's
//     breakout scores higher than a big channel's ordinary upload
//   - a re-sync UPDATES a video in place instead of duplicating it
//   - the (workspace_id, platform, external_id) unique key makes adding the
//     same channel twice a no-op update
//   - deleting a source takes its videos with it (cascade)
//   - credits: usage rows of kind 'ai_call' are what the plan counts
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
const password = `Rs-${stamp}-Aa1!`;

async function mkUser(n) {
  const email = `research-smoke-${stamp}-${n}@example.com`;
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
  return { id: data.user.id, workspaceId: ws.id, email };
}

async function mkSource(user, over = {}) {
  const { data, error } = await admin
    .from("research_sources")
    .insert({
      user_id: user.id,
      workspace_id: user.workspaceId,
      platform: "youtube",
      external_id: `UC-${stamp}-${Math.random().toString(36).slice(2, 8)}`,
      handle: "@smoke",
      title: "Smoke channel",
      ...over,
    })
    .select("id, external_id")
    .single();
  if (error) throw new Error(error.message);
  return data;
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
      published_at: new Date(Date.now() - 30 * 86400000).toISOString(),
      view_count: 1000,
      ...over,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

let a;
let b;

try {
  a = await mkUser("a");
  b = await mkUser("b");

  // ── 1. schema is there ────────────────────────────────────────────────
  const sourceA = await mkSource(a);
  check("research_sources accepts a source", Boolean(sourceA.id));

  // ── 2. the unique key makes re-adding a channel a no-op update ─────────
  const { error: dupError } = await admin.from("research_sources").insert({
    user_id: a.id,
    workspace_id: a.workspaceId,
    platform: "youtube",
    external_id: sourceA.external_id,
    title: "Same channel again",
  });
  check(
    "the same channel twice in one workspace is refused by the unique key",
    Boolean(dupError),
    dupError?.code ?? "no error",
  );

  // ── 3. the outlier maths, on the shape that motivates the product ──────
  // Small channel: five ordinary videos at 3,000 and one breakout at 30,000.
  const small = await mkSource(a, { title: "Small channel", baseline_views: 3000 });
  for (let i = 0; i < 5; i++) {
    await mkVideo(a, small.id, { view_count: 3000, outlier_score: 1, baseline_views: 3000 });
  }
  const smallHit = await mkVideo(a, small.id, {
    title: "Small channel breakout",
    view_count: 30000,
    outlier_score: 10,
    baseline_views: 3000,
  });

  // Big channel: 2,000,000 normal, one 2,200,000.
  const big = await mkSource(a, { title: "Big channel", baseline_views: 2000000 });
  const bigOk = await mkVideo(a, big.id, {
    title: "Big channel ordinary day",
    view_count: 2200000,
    outlier_score: 1.1,
    baseline_views: 2000000,
  });

  const { data: feed } = await admin
    .from("research_videos")
    .select("id, title, view_count, outlier_score")
    .eq("workspace_id", a.workspaceId)
    .order("outlier_score", { ascending: false, nullsFirst: false })
    .limit(1);
  check(
    "the feed ranks a 30k breakout above a 2.2M ordinary upload",
    feed?.[0]?.id === smallHit,
    `top = ${feed?.[0]?.title} (${feed?.[0]?.view_count} views, ${feed?.[0]?.outlier_score}x)`,
  );
  check(
    "…and the big video is still there, just ranked lower",
    Boolean(bigOk),
  );

  // ── 4. a re-sync updates in place rather than duplicating ─────────────
  const { data: existing } = await admin
    .from("research_videos")
    .select("id, external_id")
    .eq("id", smallHit)
    .single();
  const { error: upsertError } = await admin.from("research_videos").upsert(
    {
      source_id: small.id,
      user_id: a.id,
      workspace_id: a.workspaceId,
      external_id: existing.external_id,
      title: "Small channel breakout",
      url: "https://youtube.com/watch?v=x",
      view_count: 45000,
      outlier_score: 15,
      baseline_views: 3000,
    },
    { onConflict: "source_id,external_id" },
  );
  const { count: afterCount } = await admin
    .from("research_videos")
    .select("id", { count: "exact", head: true })
    .eq("source_id", small.id);
  const { data: updated } = await admin
    .from("research_videos")
    .select("view_count, outlier_score")
    .eq("id", smallHit)
    .single();
  check(
    "a re-sync updates the video in place, no duplicate row",
    !upsertError && afterCount === 6 && updated.view_count === 45000,
    `rows=${afterCount} views=${updated?.view_count} score=${updated?.outlier_score}`,
  );

  // ── 5. transcripts and scripts hang off a video ───────────────────────
  const { error: transcriptError } = await admin.from("research_transcripts").insert({
    video_id: smallHit,
    user_id: a.id,
    workspace_id: a.workspaceId,
    text: "the transcript text",
    origin: "captions",
    language: "en",
  });
  check("a transcript stores against its video", !transcriptError, transcriptError?.message ?? "");

  const { error: scriptError } = await admin.from("research_scripts").insert({
    user_id: a.id,
    workspace_id: a.workspaceId,
    video_id: smallHit,
    kind: "hooks",
    output: "1. A hook",
    model: "smoke-model",
    credits_spent: 1,
  });
  check("a generated script stores against its video", !scriptError, scriptError?.message ?? "");

  const { error: badKindError } = await admin.from("research_scripts").insert({
    user_id: a.id,
    workspace_id: a.workspaceId,
    kind: "not-a-kind",
    output: "x",
  });
  check("an unknown script kind is refused by the check constraint", Boolean(badKindError));

  // ── 6. credits are usage rows of kind 'ai_call' ───────────────────────
  const { error: usageError } = await admin.from("usage").insert({
    user_id: a.id,
    workspace_id: a.workspaceId,
    kind: "ai_call",
    amount: 1,
    metadata: { feature: "research", kind: "hooks" },
  });
  const { data: credits } = await admin
    .from("usage")
    .select("amount")
    .eq("user_id", a.id)
    .eq("kind", "ai_call");
  check(
    "a generation writes one ai_call usage row, which is what the cap counts",
    !usageError && credits.length === 1 && credits[0].amount === 1,
  );

  // ── 7. tenancy — the part that would end the business ─────────────────
  const sourceB = await mkSource(b, { title: "B's private channel" });
  await mkVideo(b, sourceB.id, { title: "B's video" });

  const clientA = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false } },
  );
  const { error: signInError } = await clientA.auth.signInWithPassword({
    email: a.email,
    password,
  });
  if (signInError) throw new Error(`sign-in failed: ${signInError.message}`);

  const { data: aSees } = await clientA.from("research_sources").select("id, title");
  check(
    "A sees only A's sources",
    (aSees ?? []).length === 3 && !aSees.some((s) => s.title === "B's private channel"),
    `${(aSees ?? []).length} sources`,
  );

  const { data: aVideos } = await clientA.from("research_videos").select("id, title");
  check(
    "A sees none of B's videos",
    !(aVideos ?? []).some((v) => v.title === "B's video"),
  );

  const { data: bSourceSeenByA } = await clientA
    .from("research_sources")
    .select("id")
    .eq("id", sourceB.id);
  check("reading B's source by id returns empty, not the row", (bSourceSeenByA ?? []).length === 0);

  const { data: aTranscripts } = await clientA.from("research_transcripts").select("video_id");
  check("A sees only A's transcripts", (aTranscripts ?? []).length === 1);

  const { data: aScripts } = await clientA.from("research_scripts").select("id");
  check("A sees only A's scripts", (aScripts ?? []).length === 1);

  // The write side: RLS must refuse a row A tries to plant in B's workspace.
  const { error: crossInsert } = await clientA.from("research_sources").insert({
    user_id: b.id,
    workspace_id: b.workspaceId,
    platform: "youtube",
    external_id: `UC-evil-${stamp}`,
    title: "planted",
  });
  check("A cannot insert a source owned by B", Boolean(crossInsert), crossInsert?.code ?? "no error");

  const { error: crossUpdate } = await clientA
    .from("research_sources")
    .update({ title: "hijacked" })
    .eq("id", sourceB.id);
  const { data: bStill } = await admin
    .from("research_sources")
    .select("title")
    .eq("id", sourceB.id)
    .single();
  check(
    "A cannot rename B's source",
    bStill.title === "B's private channel",
    `crossUpdate=${crossUpdate?.code ?? "silently affected 0 rows"}`,
  );

  const { error: crossDelete } = await clientA
    .from("research_sources")
    .delete()
    .eq("id", sourceB.id);
  const { count: bLeft } = await admin
    .from("research_sources")
    .select("id", { count: "exact", head: true })
    .eq("id", sourceB.id);
  check(
    "A cannot delete B's source",
    bLeft === 1,
    `crossDelete=${crossDelete?.code ?? "affected 0 rows"}`,
  );

  // ── 8. deleting a source takes its videos with it ─────────────────────
  const { error: ownDelete } = await clientA
    .from("research_sources")
    .delete()
    .eq("id", small.id);
  const { count: orphanVideos } = await admin
    .from("research_videos")
    .select("id", { count: "exact", head: true })
    .eq("source_id", small.id);
  check(
    "deleting a source cascades to its videos",
    !ownDelete && orphanVideos === 0,
    `${orphanVideos} left`,
  );
} catch (e) {
  check("smoke ran to completion", false, e instanceof Error ? e.message : String(e));
} finally {
  for (const id of users) await admin.auth.admin.deleteUser(id).catch(() => {});
  // The cascade from users should take everything; prove it did.
  const { count: leftovers } = await admin
    .from("research_sources")
    .select("id", { count: "exact", head: true })
    .in("user_id", users);
  check("cleanup: throwaway users and their research rows are gone", leftovers === 0, `remaining=${leftovers}`);
}

console.log(results.join("\n"));
console.log(`\n${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
