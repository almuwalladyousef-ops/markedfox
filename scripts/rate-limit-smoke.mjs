// Smoke test: the app-level rate limiter, against real Postgres.
//
//   node scripts/rate-limit-smoke.mjs
//
// The limiter's whole job is to hold under concurrent calls, and concurrency
// is exactly what a unit test with a fake client cannot prove — limit.test.ts
// pins the policy and the fail-open behaviour, this pins the SQL.
//
// Proves, on live rows:
//   - the counter allows up to the ceiling and refuses past it, with a retry
//     hint bounded by the window
//   - a REFUSED call spends nothing, so a locked-out caller cannot extend
//     their own lockout by continuing to knock
//   - twenty SIMULTANEOUS calls against a limit of five let exactly five
//     through — the increment-and-check really is atomic
//   - reset_rate_limit restores the full allowance (what a correct password
//     earns back after a few fumbled ones)
//   - prune_rate_limits deletes stale windows and keeps fresh ones
//   - none of it is reachable by a browser role: the table has RLS with no
//     policies, and the functions are revoked from anon and authenticated
// Every row this creates is removed at the end.
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
const browser = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false } },
);

const results = [];
let failures = 0;
const check = (name, ok, detail = "") => {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
};

const stamp = Math.random().toString(36).slice(2, 8);
const KEY = `smoke:basic:${stamp}`;
const CONCURRENT_KEY = `smoke:concurrent:${stamp}`;

async function consume(key, limit = 3, windowSeconds = 60) {
  const { data, error } = await admin.rpc("consume_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
    p_cost: 1,
  });
  if (error) throw new Error(`consume_rate_limit: ${error.message}`);
  return Array.isArray(data) ? data[0] : data;
}

try {
  // ── counting and refusing ───────────────────────────────────────────────
  const first = await consume(KEY);
  const second = await consume(KEY);
  const third = await consume(KEY);
  check(
    "allows up to the ceiling",
    first.allowed && second.allowed && third.allowed,
  );
  check(
    "reports what is left",
    first.remaining === 2 && third.remaining === 0,
    `${first.remaining} then ${third.remaining}`,
  );

  const fourth = await consume(KEY);
  check("refuses past the ceiling", fourth.allowed === false);
  check(
    "refusal carries a retry time inside the window",
    fourth.retry_after_seconds > 0 && fourth.retry_after_seconds <= 60,
    `${fourth.retry_after_seconds}s`,
  );

  // Knocking while locked out must not push the lockout further away.
  const { data: before } = await admin
    .from("rate_limits").select("used").eq("key", KEY).single();
  await consume(KEY);
  await consume(KEY);
  const { data: after } = await admin
    .from("rate_limits").select("used").eq("key", KEY).single();
  check(
    "a refused call spends nothing",
    before.used === after.used,
    `${before.used} then ${after.used}`,
  );

  // ── atomicity ───────────────────────────────────────────────────────────
  const racers = await Promise.all(
    Array.from({ length: 20 }, () => consume(CONCURRENT_KEY, 5, 60)),
  );
  const allowed = racers.filter((r) => r.allowed).length;
  check(
    "twenty simultaneous calls against a limit of five let exactly five through",
    allowed === 5,
    `${allowed} allowed`,
  );

  // ── reset ───────────────────────────────────────────────────────────────
  const { error: resetError } = await admin.rpc("reset_rate_limit", { p_key: KEY });
  const afterReset = await consume(KEY);
  check(
    "reset restores the full allowance",
    !resetError && afterReset.allowed && afterReset.remaining === 2,
    JSON.stringify(afterReset),
  );

  // ── pruning ─────────────────────────────────────────────────────────────
  await admin
    .from("rate_limits")
    .update({ updated_at: new Date(Date.now() - 3 * 86_400_000).toISOString() })
    .eq("key", KEY);
  const { data: pruned, error: pruneError } = await admin.rpc("prune_rate_limits", {
    p_older_than_seconds: 86_400,
  });
  check("prune deletes a stale window", !pruneError && Number(pruned) >= 1, String(pruned));
  const { data: survivor } = await admin
    .from("rate_limits").select("key").eq("key", CONCURRENT_KEY).maybeSingle();
  check("prune keeps a fresh window", survivor !== null);

  // ── not reachable from a browser ────────────────────────────────────────
  const { data: leaked } = await browser.from("rate_limits").select("key").limit(1);
  check(
    "a browser role reads nothing from rate_limits",
    !leaked || leaked.length === 0,
  );
  const { error: writeError } = await browser
    .from("rate_limits").insert({ key: `anon:${stamp}`, used: 0 });
  check("a browser role cannot write rate_limits", Boolean(writeError));
  const { error: rpcError } = await browser.rpc("consume_rate_limit", {
    p_key: `anon:${stamp}`, p_limit: 1, p_window_seconds: 60, p_cost: 1,
  });
  check("a browser role cannot call consume_rate_limit", Boolean(rpcError));
  const { error: resetRpcError } = await browser.rpc("reset_rate_limit", {
    p_key: `anon:${stamp}`,
  });
  check("a browser role cannot call reset_rate_limit", Boolean(resetRpcError));
} finally {
  await admin.from("rate_limits").delete().in("key", [KEY, CONCURRENT_KEY]);
}

console.log(results.join("\n"));
console.log(`\nrate-limit smoke: ${results.length - failures}/${results.length}`);
process.exit(failures ? 1 : 0);
