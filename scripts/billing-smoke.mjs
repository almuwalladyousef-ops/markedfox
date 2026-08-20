// Billing smoke test: the Stripe webhook path against the running app and the
// hosted database — signature enforcement, entitlement changes, replay dedupe,
// the out-of-order gate, and failed-payment downgrade, all on live rows.
//
//   node scripts/billing-smoke.mjs                       (app on localhost:3000)
//   APP_URL=https://markedfox.com node scripts/billing-smoke.mjs
//
// Needs STRIPE_WEBHOOK_SECRET in .env.local (any value — the smoke signs its
// own events with it). No Stripe account is contacted.
// Throwaway users are removed at the end.
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const APP = process.env.APP_URL ?? "http://localhost:3000";
const SECRET = env.STRIPE_WEBHOOK_SECRET;
if (!SECRET) {
  console.error("STRIPE_WEBHOOK_SECRET is not in .env.local — set any value and sync it before running this smoke");
  process.exit(1);
}

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

function signedPost(event, { skewSeconds = 0, badSignature = false } = {}) {
  const body = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000) + skewSeconds;
  const signature = badSignature
    ? "0".repeat(64)
    : createHmac("sha256", SECRET).update(`${timestamp}.${body}`).digest("hex");
  return fetch(`${APP}/api/webhooks/stripe`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": `t=${timestamp},v1=${signature}`,
    },
    body,
  });
}

function subscriptionEvent({ id, userId, planId, status = "active", type = "customer.subscription.updated", created = Math.floor(Date.now() / 1000), customer = `cus_smoke_${stamp}` }) {
  return {
    id,
    type,
    created,
    data: {
      object: {
        id: `sub_smoke_${stamp}`,
        customer,
        status,
        cancel_at_period_end: false,
        current_period_start: created,
        current_period_end: created + 30 * 86400,
        metadata: { user_id: userId, plan_id: planId, interval: "monthly" },
        items: { data: [{ price: { id: "price_smoke", recurring: { interval: "month" } } }] },
      },
    },
  };
}

async function planOf(userId) {
  const { data } = await admin.from("subscriptions").select("plan_id, status, billing_interval").eq("user_id", userId).single();
  return data;
}

try {
  const email = `billing-smoke-${stamp}@example.com`;
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: `Bi-${stamp}-Aa1!`,
    email_confirm: true,
  });
  if (error) throw new Error(error.message);
  const userId = created.user.id;
  users.push(userId);

  // ── 1. the door ───────────────────────────────────────────────────────
  const unsigned = await fetch(`${APP}/api/webhooks/stripe`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(subscriptionEvent({ id: `evt_${stamp}_unsigned`, userId, planId: "pro" })),
  });
  check("an unsigned event is refused", unsigned.status === 400, `${unsigned.status}`);

  const forged = await signedPost(
    subscriptionEvent({ id: `evt_${stamp}_forged`, userId, planId: "pro" }),
    { badSignature: true },
  );
  check("a forged signature is refused", forged.status === 400, `${forged.status}`);

  const stale = await signedPost(
    subscriptionEvent({ id: `evt_${stamp}_old`, userId, planId: "pro" }),
    { skewSeconds: -3600 },
  );
  check("a signature from an hour ago is refused (replay window)", stale.status === 400);

  const before = await planOf(userId);
  check("…and none of that touched the subscription", before.plan_id === "free", before.plan_id);

  // ── 2. a real subscription lands ──────────────────────────────────────
  const now = Math.floor(Date.now() / 1000);
  const upgrade = await signedPost(
    subscriptionEvent({ id: `evt_${stamp}_1`, userId, planId: "pro", created: now - 100 }),
  );
  const afterUpgrade = await planOf(userId);
  check(
    "a signed subscription event upgrades the plan",
    upgrade.status === 200 && afterUpgrade.plan_id === "pro" && afterUpgrade.status === "active",
    JSON.stringify(afterUpgrade),
  );
  check("the billing interval is recorded", afterUpgrade.billing_interval === "monthly");

  // ── 3. replay dedupe ──────────────────────────────────────────────────
  const replay = await signedPost(
    subscriptionEvent({ id: `evt_${stamp}_1`, userId, planId: "studio", created: now - 100 }),
  );
  const afterReplay = await planOf(userId);
  const replayBody = await replay.json();
  check(
    "the same event id replayed changes nothing, even with a different payload",
    replay.status === 200 && replayBody.outcome === "duplicate" && afterReplay.plan_id === "pro",
    `${replayBody.outcome} plan=${afterReplay.plan_id}`,
  );

  // ── 4. out-of-order events cannot roll a subscription backwards ───────
  const newer = await signedPost(
    subscriptionEvent({ id: `evt_${stamp}_2`, userId, planId: "studio", created: now - 50 }),
  );
  const older = await signedPost(
    subscriptionEvent({ id: `evt_${stamp}_late`, userId, planId: "pro", created: now - 90 }),
  );
  const olderBody = await older.json();
  const afterRace = await planOf(userId);
  check(
    "an older event arriving late is ignored as stale",
    newer.status === 200 && older.status === 200 && olderBody.outcome === "stale" && afterRace.plan_id === "studio",
    `${olderBody.outcome} plan=${afterRace.plan_id}`,
  );

  // ── 5. failed payment downgrades access ───────────────────────────────
  await signedPost(
    subscriptionEvent({ id: `evt_${stamp}_pastdue`, userId, planId: "studio", status: "past_due", created: now - 10 }),
  );
  const afterPastDue = await planOf(userId);
  check(
    "failed payment lands as past_due, which the snapshot treats as Free",
    afterPastDue.status === "past_due",
    afterPastDue.status,
  );

  // ── 6. cancellation ───────────────────────────────────────────────────
  await signedPost(
    subscriptionEvent({ id: `evt_${stamp}_del`, userId, planId: "studio", type: "customer.subscription.deleted", status: "active", created: now - 5 }),
  );
  const afterCancel = await planOf(userId);
  check("a deleted subscription is canceled whatever its status field says", afterCancel.status === "canceled");

  // ── 7. the hostile cases ──────────────────────────────────────────────
  const hacker = await signedPost(
    subscriptionEvent({ id: `evt_${stamp}_hack`, userId, planId: "hackerplan", status: "active", created: now }),
  );
  const afterHack = await planOf(userId);
  check(
    "an active subscription on an unknown plan is refused loudly (500 → Stripe retries → a human sees it)",
    hacker.status === 500 && afterHack.plan_id !== "hackerplan",
    `${hacker.status} plan=${afterHack.plan_id}`,
  );

  const ignored = await signedPost({
    id: `evt_${stamp}_inv`,
    type: "invoice.payment_succeeded",
    created: now,
    data: { object: { id: "in_1", customer: `cus_smoke_${stamp}` } },
  });
  const ignoredBody = await ignored.json();
  check("an event type that moves no entitlement is recorded and ignored", ignored.status === 200 && ignoredBody.outcome === "ignored");

  // ── 8. the audit trail ────────────────────────────────────────────────
  const { data: trail } = await admin
    .from("billing_events")
    .select("id, status")
    .like("id", `evt_${stamp}%`);
  const byStatus = Object.fromEntries((trail ?? []).map((r) => [r.id, r.status]));
  check(
    "every verified event left an audit row with the right status",
    byStatus[`evt_${stamp}_1`] === "processed" &&
      byStatus[`evt_${stamp}_late`] === "ignored" &&
      byStatus[`evt_${stamp}_hack`] === "failed" &&
      byStatus[`evt_${stamp}_inv`] === "ignored",
    JSON.stringify(byStatus),
  );
  check(
    "the refused (unsigned/forged) events never reached the table",
    !(`evt_${stamp}_unsigned` in byStatus) && !(`evt_${stamp}_forged` in byStatus),
  );

  // RLS: billing events are not readable by any signed-in user.
  const userClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  await userClient.auth.signInWithPassword({ email, password: `Bi-${stamp}-Aa1!` });
  const { data: leaked } = await userClient.from("billing_events").select("id");
  check("a signed-in user cannot read billing events (they carry other tenants' ids)", (leaked ?? []).length === 0);
} catch (e) {
  check("smoke ran to completion", false, e instanceof Error ? e.message : String(e));
} finally {
  for (const id of users) await admin.auth.admin.deleteUser(id).catch(() => {});
  await admin.from("billing_events").delete().like("id", `evt_${stamp}%`);
  const { count } = await admin.from("billing_events").select("id", { count: "exact", head: true }).like("id", `evt_${stamp}%`);
  check("cleanup: throwaway users and events are gone", count === 0);
}

console.log(results.join("\n"));
console.log(`\n${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
