// DM engine smoke test: a signed Meta webhook through the running app to the
// hosted project, end to end up to the platform send.
//
//   node scripts/dm-smoke.mjs            (app on http://localhost:3000)
//   APP_URL=https://markedfox.com node scripts/dm-smoke.mjs
//
// Proves, on live rows:
//   - GET verification handshake answers the challenge only with the right token
//   - an unsigned / mis-signed POST is refused and records nothing
//   - a signed comment webhook for user A's account lands in webhook_events,
//     fires ONLY A's rule (B has a catch-all rule on another account), queues
//     one job per step with the dedupe keys, records 'triggered'
//   - the same delivery again stores nothing and queues nothing
//   - the worker claims the jobs; with a fake token the platform refuses, the
//     connection is marked expired, jobs fail, the rule's numbers show it
//   - a DM from the fan opens the 24-hour window (dm_contacts.last_inbound_at)
//   - /r/<token> redirects and records a click; an unknown token 404s
// Throwaway users are removed at the end.
import { createClient } from "@supabase/supabase-js";
import { createCipheriv, createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const APP = process.env.APP_URL ?? "http://localhost:3000";
const KEY = Buffer.from(env.TOKEN_ENCRYPTION_KEY, "base64");
const encrypt = (plain) => {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", KEY, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), ct.toString("base64url"), c.getAuthTag().toString("base64url")].join(".");
};
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const results = [];
let failures = 0;
const check = (name, ok, detail = "") => {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
};
const stamp = Math.random().toString(36).slice(2, 8);
const users = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function mkUser(n) {
  const email = `dm-smoke-${stamp}-${n}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: `Dm-${stamp}-Aa1!`, email_confirm: true });
  if (error) throw new Error(error.message);
  users.push(data.user.id);
  const { data: ws } = await admin.from("workspaces").select("id").eq("owner_id", data.user.id).single();
  return { id: data.user.id, workspaceId: ws.id };
}
async function mkIg(user, accountId) {
  const { data, error } = await admin.from("connections").insert({
    user_id: user.id, workspace_id: user.workspaceId, platform: "instagram",
    platform_account_id: accountId, platform_account_name: `ig-${accountId}`,
    access_token_encrypted: encrypt("fake-page-token"),
    scopes: ["instagram_basic", "instagram_manage_comments", "instagram_manage_messages", "pages_messaging"],
    metadata: { pageId: "page-1", metaUserId: "fb-1" },
  }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}
async function mkRule(user, connectionId, over = {}) {
  const { data, error } = await admin.from("dm_rules").insert({
    user_id: user.id, workspace_id: user.workspaceId, connection_id: connectionId,
    name: "smoke", enabled: true, trigger_type: "comment", keywords: ["link"], target_post_ids: [],
    actions: [
      { type: "private_reply", text: "Here you go", buttons: [{ title: "Open", url: "https://example.com/guide" }] },
      { type: "comment_reply", text: "Sent!" },
      { type: "message", text: "Still there?", delay_seconds: 60 },
    ],
    config: {}, ...over,
  }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}
const sign = (body) => `sha256=${createHmac("sha256", env.META_APP_SECRET).update(body).digest("hex")}`;
async function postWebhook(body, signature) {
  const raw = JSON.stringify(body);
  const res = await fetch(`${APP}/api/webhooks/meta`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(signature === null ? {} : { "x-hub-signature-256": signature ?? sign(raw) }) },
    body: raw,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
async function count(table, filter) {
  let q = admin.from(table).select("id", { count: "exact", head: true });
  for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
  const { count: n, error } = await q;
  if (error) throw new Error(error.message);
  return n;
}
const igA = `ig-${stamp}-a`;
const igB = `ig-${stamp}-b`;
const commentId = `c-${stamp}-1`;

try {
  // 0. handshake
  const ok = await fetch(`${APP}/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(env.META_WEBHOOK_VERIFY_TOKEN)}&hub.challenge=12345`);
  check("GET handshake echoes the challenge for the right verify token", ok.status === 200 && (await ok.text()) === "12345");
  const bad = await fetch(`${APP}/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345`);
  check("GET handshake refuses a wrong verify token", bad.status === 403);

  const a = await mkUser("a");
  const b = await mkUser("b");
  const connA = await mkIg(a, igA);
  const connB = await mkIg(b, igB);
  const ruleA = await mkRule(a, connA);
  const ruleB = await mkRule(b, connB, { keywords: [] }); // catch-all on B's account

  const delivery = {
    object: "instagram",
    entry: [{ id: igA, time: Math.floor(Date.now() / 1000), changes: [{ field: "comments", value: { id: commentId, text: "LINK please", from: { id: `fan-${stamp}`, username: "fan" }, media: { id: "m1" } } }] }],
  };

  // 1. unsigned / mis-signed
  const unsigned = await postWebhook(delivery, null);
  check("POST without a signature is refused (401)", unsigned.status === 401, `status ${unsigned.status}`);
  const wrong = await postWebhook(delivery, "sha256=" + "00".repeat(32));
  check("POST with a wrong signature is refused (401)", wrong.status === 401, `status ${wrong.status}`);
  check("nothing recorded for refused deliveries", (await count("webhook_events", { external_id: `ig-comment:${commentId}` })) === 0);

  // 2. signed delivery
  const first = await postWebhook(delivery);
  check("signed comment delivery accepted", first.status === 200 && first.body.stored === 1, JSON.stringify(first.body));
  await sleep(4000); // the after() drain
  check("event recorded once", (await count("webhook_events", { external_id: `ig-comment:${commentId}` })) === 1);
  const { data: jobsA } = await admin.from("dm_jobs").select("kind, dedupe_key, status, last_error").eq("rule_id", ruleA).order("created_at");
  check("A's rule queued one job per step (3)", jobsA?.length === 3, JSON.stringify(jobsA?.map((j) => [j.kind, j.status])));
  check("dedupe keys are rule:event:step", jobsA?.every((j) => j.dedupe_key.startsWith(`${ruleA}:ig-comment:${commentId}:`)) === true);
  check("B's catch-all rule on another account queued NOTHING", (await count("dm_jobs", { rule_id: ruleB })) === 0);
  check("'triggered' recorded for A's rule", (await count("dm_events", { rule_id: ruleA, kind: "triggered" })) === 1);
  check("no events for B", (await count("dm_events", { user_id: b.id })) === 0);

  // 3. replay
  const again = await postWebhook(delivery);
  check("replayed delivery stores nothing", again.status === 200 && again.body.stored === 0, JSON.stringify(again.body));
  await sleep(1500);
  check("replay queued nothing new", (await count("dm_jobs", { rule_id: ruleA })) === 3);

  // 4. the worker ran: fake token → platform refuses → connection expired, jobs failed/skipped
  const { data: conn } = await admin.from("connections").select("status").eq("id", connA).single();
  const { data: jobsAfter } = await admin.from("dm_jobs").select("kind, status, last_error").eq("rule_id", ruleA);
  const due = jobsAfter?.filter((j) => j.kind !== "message") ?? [];
  check("worker attempted the due jobs (private reply + comment reply left pending state)", due.every((j) => j.status !== "pending"), JSON.stringify(jobsAfter));
  check("platform refused the fake token → connection marked expired", conn?.status === "expired", conn?.status);
  const followUp = jobsAfter?.find((j) => j.kind === "message");
  check("the 60s follow-up is still waiting for its time", followUp?.status === "pending", followUp?.status);
  const { data: evts } = await admin.from("dm_events").select("kind").eq("rule_id", ruleA);
  check("rule's ledger shows triggered + failed", (evts ?? []).some((e) => e.kind === "triggered") && (evts ?? []).some((e) => e.kind === "failed"), JSON.stringify(evts?.map((e) => e.kind)));

  // 5. a DM from the fan opens the window
  await admin.from("connections").update({ status: "active" }).eq("id", connA);
  const dm = { object: "instagram", entry: [{ id: igA, time: Math.floor(Date.now() / 1000), messaging: [{ sender: { id: `fan-${stamp}` }, recipient: { id: igA }, timestamp: Date.now(), message: { mid: `mid-${stamp}`, text: "hi there" } }] }] };
  const dmRes = await postWebhook(dm);
  check("signed message delivery accepted", dmRes.status === 200 && dmRes.body.stored === 1);
  await sleep(2500);
  const { data: contact } = await admin.from("dm_contacts").select("last_inbound_at, username").eq("connection_id", connA).eq("platform_user_id", `fan-${stamp}`).maybeSingle();
  check("contact exists with last_inbound_at set by the DM", Boolean(contact?.last_inbound_at), JSON.stringify(contact));

  // 6. tracked link
  const token = `smoke${stamp}`;
  await admin.from("dm_links").insert({ token, user_id: a.id, workspace_id: a.workspaceId, rule_id: ruleA, destination_url: "https://example.com/landing?x=1" });
  const r = await fetch(`${APP}/r/${token}`, { redirect: "manual" });
  check("/r/<token> redirects to the destination", r.status === 302 && r.headers.get("location") === "https://example.com/landing?x=1", `${r.status} ${r.headers.get("location")}`);
  await sleep(800);
  check("click recorded on the rule", (await count("dm_events", { rule_id: ruleA, kind: "clicked" })) === 1);
  const nf = await fetch(`${APP}/r/nope-${stamp}`, { redirect: "manual" });
  check("unknown token 404s", nf.status === 404);

  // 7. rule stats RPC through a user session (RLS)
  const userClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  await userClient.auth.signInWithPassword({ email: `dm-smoke-${stamp}-a@example.com`, password: `Dm-${stamp}-Aa1!` });
  const { data: statsA } = await userClient.rpc("dm_rule_stats", { p_workspace_id: a.workspaceId });
  check("dm_rule_stats returns A's own numbers", Array.isArray(statsA) && statsA.some((s) => s.rule_id === ruleA && s.kind === "triggered"), JSON.stringify(statsA));
  const { data: statsB } = await userClient.rpc("dm_rule_stats", { p_workspace_id: b.workspaceId });
  check("…and nothing for B's workspace (RLS)", Array.isArray(statsB) && statsB.length === 0, JSON.stringify(statsB));
  const { data: bJobsSeenByA } = await userClient.from("dm_jobs").select("id").eq("user_id", b.id);
  check("A cannot read B's jobs", (bJobsSeenByA ?? []).length === 0);
} catch (e) {
  check("smoke ran to completion", false, e instanceof Error ? e.message : String(e));
} finally {
  for (const id of users) await admin.auth.admin.deleteUser(id).catch(() => {});
  await admin.from("webhook_events").delete().in("platform_account_id", [igA, igB]);
}

console.log(results.join("\n"));
console.log(`\n${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
