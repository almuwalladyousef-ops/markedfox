// Deletion smoke test: Meta's deauthorize + data-deletion callbacks and the
// account-deletion path, against the hosted project through a running app.
//
//   node scripts/deletion-smoke.mjs            (app on http://localhost:3000)
//   APP_URL=https://markedfox.com node scripts/deletion-smoke.mjs
//
// Proves, on live rows:
//   - a forged signed_request deletes nothing (deauthorize 200s but is inert;
//     data-deletion answers 400)
//   - a request signed with META_APP_SECRET for a Facebook user id deletes
//     exactly the Instagram/Facebook connections carrying that metaUserId —
//     and NOT a second user's connection with a different id
//   - the data-deletion route returns a confirmation code whose status URL
//     says "complete", and an unknown code 404s
//   - deleteUser cascades: after the admin delete, none of the user's rows
//     remain in connections / scheduled_posts / workspaces
// Creates throwaway users and removes them at the end.
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
const sign = (payload, secret) => {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${sig}.${body}`;
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

async function mkUser(n) {
  const email = `del-smoke-${stamp}-${n}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: `Del-${stamp}-Aa1!`, email_confirm: true });
  if (error) throw new Error(error.message);
  users.push(data.user.id);
  const { data: ws } = await admin.from("workspaces").select("id").eq("owner_id", data.user.id).single();
  return { id: data.user.id, workspaceId: ws.id };
}
async function mkConnection(user, platform, accountId, metadata) {
  const { data, error } = await admin.from("connections").insert({
    user_id: user.id, workspace_id: user.workspaceId, platform,
    platform_account_id: accountId, platform_account_name: `${platform}-${accountId}`,
    access_token_encrypted: encrypt(`tok-${accountId}`), scopes: [], metadata,
  }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}
async function postForm(path, signed) {
  const form = new URLSearchParams({ signed_request: signed });
  const res = await fetch(`${APP}${path}`, { method: "POST", body: form });
  return { status: res.status, body: await res.text() };
}
async function count(table, filter) {
  let q = admin.from(table).select("id", { count: "exact", head: true });
  for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
  const { count: n, error } = await q;
  if (error) throw new Error(error.message);
  return n;
}

try {
  const a = await mkUser("a");
  const b = await mkUser("b");
  const metaA = `fbuser-${stamp}-a`;
  const metaB = `fbuser-${stamp}-b`;

  // A: an Instagram + a Facebook connection from the same Facebook login, plus
  // a Threads connection (separate product, different id space).
  const aIg = await mkConnection(a, "instagram", `ig-${stamp}`, { pageId: "p1", metaUserId: metaA });
  const aFb = await mkConnection(a, "facebook", `page-${stamp}`, { pageName: "P", metaUserId: metaA });
  const aTh = await mkConnection(a, "threads", `th-${stamp}`, {});
  // B: a connection under a different Facebook user.
  const bIg = await mkConnection(b, "instagram", `ig-${stamp}-b`, { metaUserId: metaB });
  // History rows hanging off A's Instagram connection.
  await admin.from("history").insert([
    { user_id: a.id, workspace_id: a.workspaceId, connection_id: aIg, platform: "instagram", outcome: "published", platform_post_id: "x1" },
    { user_id: a.id, workspace_id: a.workspaceId, connection_id: aIg, platform: "instagram", outcome: "failed", error: "e" },
  ]);

  // 1. Forged requests do nothing.
  const forgedDeauth = await postForm("/api/meta/deauthorize", sign({ user_id: metaA }, "not-the-secret"));
  check("forged deauthorize is acknowledged with 200 (Meta needs it) …", forgedDeauth.status === 200, `status ${forgedDeauth.status}`);
  check("… and deletes nothing", (await count("connections", { user_id: a.id })) === 3);
  const forgedDel = await postForm("/api/meta/data-deletion", sign({ user_id: metaA }, "not-the-secret"));
  check("forged data-deletion is refused with 400", forgedDel.status === 400, `status ${forgedDel.status}`);
  check("… and deletes nothing", (await count("connections", { user_id: a.id })) === 3);

  // 2. Deauthorize for A's Facebook user: IG + FB rows go, Threads and B stay.
  const deauth = await postForm("/api/meta/deauthorize", sign({ user_id: metaA, algorithm: "HMAC-SHA256" }, env.META_APP_SECRET));
  check("signed deauthorize answers 200", deauth.status === 200, `status ${deauth.status}`);
  check("A's Instagram connection deleted", (await count("connections", { id: aIg })) === 0);
  check("A's Facebook connection deleted", (await count("connections", { id: aFb })) === 0);
  check("A's Threads connection untouched (different product)", (await count("connections", { id: aTh })) === 1);
  check("B's connection untouched (different Facebook user)", (await count("connections", { id: bIg })) === 1);
  check("history rows survive a deauthorize (only tokens go)", (await count("history", { connection_id: aIg })) === 0 /* set null on cascade */ && (await count("history", { user_id: a.id })) === 2);

  // Re-create A's IG connection + history for the data-deletion leg.
  const aIg2 = await mkConnection(a, "instagram", `ig2-${stamp}`, { metaUserId: metaA });
  await admin.from("history").insert([
    { user_id: a.id, workspace_id: a.workspaceId, connection_id: aIg2, platform: "instagram", outcome: "published", platform_post_id: "x2" },
  ]);

  // 3. Data deletion for A's Facebook user.
  const del = await postForm("/api/meta/data-deletion", sign({ user_id: metaA, algorithm: "HMAC-SHA256" }, env.META_APP_SECRET));
  check("signed data-deletion answers 200", del.status === 200, `status ${del.status}`);
  let code = "";
  try { ({ confirmation_code: code } = JSON.parse(del.body)); } catch {}
  check("returns a confirmation code and a status URL", /^mf-/.test(code) && del.body.includes(`/api/meta/data-deletion?code=${code}`), del.body.slice(0, 160));
  check("A's new Instagram connection deleted", (await count("connections", { id: aIg2 })) === 0);
  check("its history rows deleted too", (await count("history", { connection_id: aIg2 })) === 0);
  check("B's connection still untouched", (await count("connections", { id: bIg })) === 1);
  const { data: req } = await admin.from("deletion_requests").select("status, source, platform_user_id, detail").eq("confirmation_code", code).maybeSingle();
  check("deletion_requests row completed", req?.status === "completed" && req.source === "meta" && req.platform_user_id === metaA, JSON.stringify(req));
  const status = await fetch(`${APP}/api/meta/data-deletion?code=${code}`);
  const statusHtml = await status.text();
  check("status URL says complete (200, HTML)", status.status === 200 && /Deletion complete/.test(statusHtml));
  const unknown = await fetch(`${APP}/api/meta/data-deletion?code=mf-nope`);
  check("unknown code is a 404, not 'received'", unknown.status === 404 && /Unknown confirmation code/.test(await unknown.text()));

  // 4. Threads product: signed with THREADS_APP_SECRET, matched on platform_account_id.
  if (env.THREADS_APP_SECRET) {
    const thDel = await postForm("/api/meta/data-deletion", sign({ user_id: `th-${stamp}` }, env.THREADS_APP_SECRET));
    check("threads-signed deletion answers 200", thDel.status === 200, `status ${thDel.status}`);
    check("A's Threads connection deleted by its Threads user id", (await count("connections", { id: aTh })) === 0);
  } else {
    results.push("SKIP  threads leg — THREADS_APP_SECRET not set locally");
  }

  // 5. Account deletion cascade (the admin half of deleteAccount()).
  await admin.from("scheduled_posts").insert({ user_id: b.id, workspace_id: b.workspaceId, caption: "x", status: "draft" });
  const { error: delErr } = await admin.auth.admin.deleteUser(b.id);
  check("admin.deleteUser succeeds", !delErr, delErr?.message);
  users.splice(users.indexOf(b.id), 1);
  check("B's connections gone", (await count("connections", { user_id: b.id })) === 0);
  check("B's posts gone", (await count("scheduled_posts", { user_id: b.id })) === 0);
  check("B's workspaces gone", (await count("workspaces", { owner_id: b.id })) === 0);
  check("B's public.users row gone", (await count("users", { id: b.id })) === 0);
} catch (e) {
  check("smoke ran to completion", false, e instanceof Error ? e.message : String(e));
} finally {
  for (const id of users) await admin.auth.admin.deleteUser(id).catch(() => {});
  await admin.from("deletion_requests").delete().like("platform_user_id", `fbuser-${stamp}-%`);
  await admin.from("deletion_requests").delete().eq("platform_user_id", `th-${stamp}`);
}

console.log(results.join("\n"));
console.log(`\n${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
