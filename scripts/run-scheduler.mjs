// One scheduler tick. Invoked by markedfox-scheduler.timer every minute.
//
// Scope note, deliberate: this claims due posts and reports them. It does not
// publish yet, because the platform adapters are stubs until Phase 3 — the
// publish call is marked below. What it does prove now is the whole plumbing:
// the timer fires, the unit runs as the service account, the service-role
// client reaches Postgres, and due rows are found and transitioned.
//
// Concurrency: systemd will not start a second instance of a oneshot unit while
// the first is still running, so with a single droplet two ticks cannot overlap
// and a row cannot be claimed twice. That guarantee ends the moment a second
// box exists — Phase 6 replaces this with SELECT … FOR UPDATE SKIP LOCKED, which
// is why the claim is already written as a conditional update rather than a
// read-then-write.
import { createClient } from "@supabase/supabase-js";

const BATCH_SIZE = 25;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`FATAL: ${name} is not set. Check /srv/markedfox/.env.production`);
    process.exit(1);
  }
  return value;
}

// Service role: this runs with no user session, so it deliberately bypasses RLS.
// Every query below therefore filters explicitly — RLS is not the safety net here.
const supabase = createClient(
  requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requireEnv("SUPABASE_SECRET_KEY"),
  { auth: { persistSession: false } },
);

async function tick() {
  const now = new Date().toISOString();

  const { data: due, error } = await supabase
    .from("scheduled_posts")
    .select("id, user_id, workspace_id, scheduled_for, attempt_count")
    .eq("status", "scheduled")
    .lte("scheduled_for", now)
    .order("scheduled_for", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error(`scheduler: query failed — ${error.message}`);
    process.exit(1);
  }

  if (!due || due.length === 0) {
    // Quiet on the common path: a line a minute, every minute, would bury the
    // journal entries that matter.
    return 0;
  }

  console.log(`scheduler: ${due.length} post(s) due at ${now}`);

  for (const post of due) {
    // Conditional claim. The `.eq("status", "scheduled")` is the important
    // part: if anything else already moved this row, the update matches zero
    // rows and this tick skips it rather than double-publishing.
    const { data: claimed, error: claimError } = await supabase
      .from("scheduled_posts")
      .update({
        status: "publishing",
        attempt_count: post.attempt_count + 1,
      })
      .eq("id", post.id)
      .eq("status", "scheduled")
      .select("id")
      .maybeSingle();

    if (claimError) {
      console.error(`scheduler: claim failed for ${post.id} — ${claimError.message}`);
      continue;
    }
    if (!claimed) {
      console.log(`scheduler: ${post.id} already claimed elsewhere, skipping`);
      continue;
    }

    // ── Phase 3 lands here ──────────────────────────────────────────────
    // Resolve each target connection, decrypt its tokens, call the adapter's
    // publish(), write a history row and a usage row per platform, then set
    // status to published / partial / failed. Until then the claim is rolled
    // back so a post is not stranded in `publishing` forever.
    const { error: releaseError } = await supabase
      .from("scheduled_posts")
      .update({
        status: "scheduled",
        last_error: "Publishing not implemented until Phase 3 adapters land",
      })
      .eq("id", post.id)
      .eq("status", "publishing");

    if (releaseError) {
      console.error(`scheduler: release failed for ${post.id} — ${releaseError.message}`);
    } else {
      console.log(`scheduler: claimed and released ${post.id} (publish pending Phase 3)`);
    }
  }

  return due.length;
}

try {
  const count = await tick();
  if (count > 0) console.log(`scheduler: tick complete, ${count} processed`);
} catch (err) {
  console.error(`scheduler: unhandled error — ${err?.message ?? err}`);
  process.exit(1);
}
