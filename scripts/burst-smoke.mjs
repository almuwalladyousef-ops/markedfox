// Phase 6 smoke test: the shared rate-limit budget and the publish queue's
// claim, against real Postgres.
//
//   node scripts/burst-smoke.mjs
//
// These two mechanisms only matter under concurrency, and concurrency is
// exactly what a unit test with a fake store cannot prove. So everything here
// runs against the hosted database, several calls genuinely in flight at once.
//
// Proves, on live rows:
//   - the budget counts, refuses at the limit, and returns a sane retry hint
//   - twenty SIMULTANEOUS requests for a budget of five let exactly five
//     through — the increment-and-check really is atomic
//   - a window that has elapsed resets rather than staying spent
//   - a recorded throttle refuses everyone until it passes, whatever the
//     counter says, and a second report cannot SHORTEN an existing block
//   - claim_scheduled_posts hands the same post to exactly one caller when
//     several claim at once (FOR UPDATE SKIP LOCKED)
//   - a post stranded in `publishing` by a dead worker is recovered, and one
//     that has burned its attempts is dead-lettered with a readable reason
//   - the budget functions are NOT reachable by a browser role
// Throwaway users and budget rows are removed at the end.
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
const password = `Bs-${stamp}-Aa1!`;
const users = [];

// A platform to experiment on without disturbing anything real. Snapchat has
// no live connections in this project, so its budget row is ours alone.
const PLATFORM = "snapchat";

const consume = (cost, limit, windowSeconds) =>
  admin.rpc("consume_platform_budget", {
    p_platform: PLATFORM,
    p_cost: cost,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

const resetBudget = () => admin.from("platform_budgets").delete().eq("platform", PLATFORM);

async function mkUser(n) {
  const email = `burst-smoke-${stamp}-${n}@example.com`;
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

async function mkPost(user, over = {}) {
  const { data, error } = await admin
    .from("scheduled_posts")
    .insert({
      user_id: user.id,
      workspace_id: user.workspaceId,
      caption: `burst ${stamp}`,
      media: [],
      target_connection_ids: [],
      platform_overrides: {},
      status: "scheduled",
      scheduled_for: new Date(Date.now() - 60_000).toISOString(),
      ...over,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

let a;

try {
  await resetBudget();

  // ── 1. the counter ────────────────────────────────────────────────────
  const first = await consume(1, 3, 3600);
  check(
    "a fresh budget allows the first call",
    first.data?.[0]?.allowed === true,
    JSON.stringify(first.data?.[0] ?? first.error?.message),
  );

  await consume(1, 3, 3600);
  await consume(1, 3, 3600);
  const fourth = await consume(1, 3, 3600);
  check(
    "the call past the limit is refused",
    fourth.data?.[0]?.allowed === false,
    JSON.stringify(fourth.data?.[0]),
  );
  check(
    "…with a retry hint inside the window, not zero",
    fourth.data?.[0]?.retry_after_seconds > 0 &&
      fourth.data?.[0]?.retry_after_seconds <= 3600,
    `${fourth.data?.[0]?.retry_after_seconds}s`,
  );

  const { data: afterRefusal } = await admin
    .from("platform_budgets")
    .select("used")
    .eq("platform", PLATFORM)
    .single();
  check(
    "a refused call spends nothing",
    afterRefusal.used === 3,
    `used=${afterRefusal.used}`,
  );

  // A cost that does not fit is refused whole rather than partly spent.
  await resetBudget();
  await consume(3, 5, 3600);
  const tooBig = await consume(3, 5, 3600);
  const { data: afterTooBig } = await admin
    .from("platform_budgets")
    .select("used")
    .eq("platform", PLATFORM)
    .single();
  check(
    "a cost that does not fit is refused whole, not partly spent",
    tooBig.data?.[0]?.allowed === false && afterTooBig.used === 3,
    `used=${afterTooBig.used}`,
  );

  // ── 2. atomicity — the reason this lives in Postgres ──────────────────
  await resetBudget();
  const simultaneous = await Promise.all(
    Array.from({ length: 20 }, () => consume(1, 5, 3600)),
  );
  const allowed = simultaneous.filter((r) => r.data?.[0]?.allowed === true).length;
  check(
    "20 simultaneous requests against a budget of 5 let exactly 5 through",
    allowed === 5,
    `${allowed} allowed`,
  );

  // ── 3. the window turns over ──────────────────────────────────────────
  await resetBudget();
  await consume(1, 1, 3600);
  const spent = await consume(1, 1, 3600);
  check("the window is spent", spent.data?.[0]?.allowed === false);
  // Backdate the window rather than sleeping an hour.
  await admin
    .from("platform_budgets")
    .update({ window_started_at: new Date(Date.now() - 7200_000).toISOString() })
    .eq("platform", PLATFORM);
  const afterWindow = await consume(1, 1, 3600);
  check(
    "an elapsed window resets instead of staying spent",
    afterWindow.data?.[0]?.allowed === true,
  );

  // ── 4. a real throttle beats the counter ──────────────────────────────
  await resetBudget();
  const { error: throttleError } = await admin.rpc("record_platform_throttle", {
    p_platform: PLATFORM,
    p_retry_after_seconds: 120,
    p_error: "(#4) Application request limit reached",
  });
  const blocked = await consume(1, 1000, 3600);
  check(
    "a recorded throttle refuses everyone, however much budget is left",
    !throttleError && blocked.data?.[0]?.allowed === false,
    `${blocked.data?.[0]?.retry_after_seconds}s`,
  );

  // A second, shorter report must not shorten the block the platform meant.
  await admin.rpc("record_platform_throttle", {
    p_platform: PLATFORM,
    p_retry_after_seconds: 5,
    p_error: "another worker saw it too",
  });
  const stillBlocked = await consume(1, 1000, 3600);
  check(
    "a shorter second report cannot shorten an existing block",
    stillBlocked.data?.[0]?.allowed === false &&
      stillBlocked.data?.[0]?.retry_after_seconds > 30,
    `${stillBlocked.data?.[0]?.retry_after_seconds}s`,
  );

  // Once it passes, the block clears rather than sticking.
  await admin
    .from("platform_budgets")
    .update({ blocked_until: new Date(Date.now() - 1000).toISOString() })
    .eq("platform", PLATFORM);
  const unblocked = await consume(1, 10, 3600);
  check(
    "the block lifts on its own once it has passed",
    unblocked.data?.[0]?.allowed === true,
  );

  // ── 5. the queue claim ────────────────────────────────────────────────
  a = await mkUser("a");
  const postIds = [];
  for (let i = 0; i < 6; i++) postIds.push(await mkPost(a));

  // Several workers claiming at once must partition the work, never share it.
  const claims = await Promise.all([
    admin.rpc("claim_scheduled_posts", { batch: 6 }),
    admin.rpc("claim_scheduled_posts", { batch: 6 }),
    admin.rpc("claim_scheduled_posts", { batch: 6 }),
  ]);
  const claimedIds = claims.flatMap((c) => (c.data ?? []).map((r) => r.id));
  const mine = claimedIds.filter((id) => postIds.includes(id));
  check(
    "concurrent claims never hand the same post to two workers",
    new Set(mine).size === mine.length,
    `${mine.length} claims, ${new Set(mine).size} distinct`,
  );
  check("every due post was claimed exactly once", new Set(mine).size === 6);

  const { data: claimedRows } = await admin
    .from("scheduled_posts")
    .select("status, claimed_at, attempt_count")
    .in("id", postIds);
  check(
    "a claim stamps status, lease, and attempt count",
    claimedRows.every(
      (r) => r.status === "publishing" && r.claimed_at !== null && r.attempt_count === 1,
    ),
  );

  // ── 6. recovery of a worker that died ─────────────────────────────────
  // Backdate three leases past the lease window; leave three fresh.
  const stale = postIds.slice(0, 3);
  await admin
    .from("scheduled_posts")
    .update({ claimed_at: new Date(Date.now() - 3600_000).toISOString() })
    .in("id", stale);
  // One of them has already burned its attempts.
  await admin
    .from("scheduled_posts")
    .update({ attempt_count: 5 })
    .eq("id", stale[2]);

  const { data: recovery, error: recoveryError } = await admin.rpc(
    "recover_stranded_posts",
    { p_lease_seconds: 900, p_max_attempts: 5 },
  );
  const row = Array.isArray(recovery) ? recovery[0] : recovery;
  check(
    "a stranded post is returned to the queue, and an exhausted one is not",
    !recoveryError && Number(row?.recovered) === 2 && Number(row?.dead_lettered) === 1,
    JSON.stringify(row ?? recoveryError?.message),
  );

  const { data: recovered } = await admin
    .from("scheduled_posts")
    .select("id, status, claimed_at, last_error")
    .in("id", stale);
  const requeued = recovered.filter((r) => r.status === "scheduled");
  const dead = recovered.find((r) => r.status === "failed");
  check(
    "a recovered post is claimable again (lease released)",
    requeued.length === 2 && requeued.every((r) => r.claimed_at === null),
  );
  check(
    "the exhausted one fails with a reason a human can act on",
    Boolean(dead?.last_error?.includes("Nothing was posted")),
    dead?.last_error?.slice(0, 80),
  );

  const { data: untouched } = await admin
    .from("scheduled_posts")
    .select("status")
    .in("id", postIds.slice(3));
  check(
    "a post still inside its lease is left alone — reclaiming it would post twice",
    untouched.every((r) => r.status === "publishing"),
  );

  // ── 7. the budget is not browser-reachable ────────────────────────────
  const userClient = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false } },
  );
  await userClient.auth.signInWithPassword({ email: a.email, password });

  const { error: rpcDenied } = await userClient.rpc("consume_platform_budget", {
    p_platform: PLATFORM,
    p_cost: 1,
    p_limit: 1,
    p_window_seconds: 60,
  });
  check("a signed-in user cannot spend the shared budget", Boolean(rpcDenied), rpcDenied?.code);

  const { error: claimDenied } = await userClient.rpc("claim_scheduled_posts", { batch: 1 });
  check("a signed-in user cannot claim the publish queue", Boolean(claimDenied), claimDenied?.code);

  const { data: budgetSeen } = await userClient.from("platform_budgets").select("platform");
  check(
    "a signed-in user cannot read the budget (it would leak other tenants' activity)",
    (budgetSeen ?? []).length === 0,
  );
} catch (e) {
  check("smoke ran to completion", false, e instanceof Error ? e.message : String(e));
} finally {
  for (const id of users) await admin.auth.admin.deleteUser(id).catch(() => {});
  await resetBudget();
  const { count } = await admin
    .from("platform_budgets")
    .select("platform", { count: "exact", head: true })
    .eq("platform", PLATFORM);
  check("cleanup: throwaway rows and the test budget are gone", count === 0);
}

console.log(results.join("\n"));
console.log(`\n${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
