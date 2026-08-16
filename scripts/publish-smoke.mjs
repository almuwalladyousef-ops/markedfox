// Publish-layer smoke test against a running app and the hosted project.
//
// Proves, on live rows and real HTTP:
//   - POST /api/posts refuses unauthenticated, malformed, invalid-content,
//     plan-locked, and other-tenant requests before writing anything
//   - a scheduled post lands as `scheduled` and the tick endpoint claims it,
//     runs the real adapter, and settles the row + history + connection state
//   - publish-now runs the whole pipeline end to end (the platform rejects
//     the fake token, which exercises the auth-error path without posting
//     anything anywhere)
//   - the daily cap is enforced for publish-now and skipped for scheduling
//   - the tick endpoint fails closed without the secret
//   - the compose and posts pages render for a signed-in user
// Creates two throwaway users and deletes them (cascading everything) at end.
//
//   npm run dev            # in one terminal, or point SMOKE_BASE at any deploy
//   node scripts/publish-smoke.mjs
//
// The session cookie is built exactly the way @supabase/ssr writes it, so the
// app authenticates these requests as it would a browser's.
import { createClient } from "@supabase/supabase-js";
import { createCipheriv, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

const BASE = (process.env.SMOKE_BASE || "http://localhost:3000").replace(/\/+$/, "");
const REF = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const COOKIE_KEY = `sb-${REF}-auth-token`;

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

// Cookie the way @supabase/ssr writes it: "base64-" + base64url(JSON session),
// chunked into name.0, name.1, … above 3180 chars.
function sessionCookies(session) {
  const value = "base64-" + Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  if (value.length <= 3180) return `${COOKIE_KEY}=${value}`;
  const parts = [];
  for (let i = 0; i * 3180 < value.length; i++) {
    parts.push(`${COOKIE_KEY}.${i}=${value.slice(i * 3180, (i + 1) * 3180)}`);
  }
  return parts.join("; ");
}

async function mkUser(n) {
  const email = `publish-smoke-${stamp}-${n}@example.com`;
  const password = `Pub-${stamp}-${n}-Aa1!`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(error.message);
  users.push(data.user.id);
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data: signed, error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(signInError.message);
  const { data: ws } = await client.from("workspaces").select("id").single();
  return { id: data.user.id, client, workspaceId: ws.id, cookie: sessionCookies(signed.session) };
}

async function addConnection(user, platform, accountId, name) {
  const { data, error } = await user.client
    .from("connections")
    .insert({
      user_id: user.id,
      workspace_id: user.workspaceId,
      platform,
      platform_account_id: accountId,
      platform_account_name: name,
      access_token_encrypted: encrypt(`fake-${platform}-token-${stamp}`),
      token_expires_at: new Date(Date.now() + 60 * 86400e3).toISOString(),
      scopes: [],
      metadata: {},
    })
    .select("id")
    .single();
  if (error) throw new Error(`connection insert: ${error.message}`);
  return data.id;
}

async function post(user, body, extraHeaders = {}) {
  const res = await fetch(`${BASE}/api/posts`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: user?.cookie ?? "", ...extraHeaders },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

try {
  // The app must be up.
  const ping = await fetch(`${BASE}/`).catch(() => null);
  if (!ping) throw new Error(`nothing answering at ${BASE} — start the app first (npm run dev)`);

  const a = await mkUser("a");
  const b = await mkUser("b");
  const fb = await addConnection(a, "facebook", `page-${stamp}`, "Smoke Page");
  const th = await addConnection(a, "threads", `th-${stamp}`, "smoke_threads");
  const x = await addConnection(a, "x", `x-${stamp}`, "smoke_x");
  const bConn = await addConnection(b, "threads", `th-b-${stamp}`, "other_tenant");

  // ── refusals, all before any row exists ────────────────────────────────
  {
    const r = await post(null, { workspaceId: a.workspaceId, targetConnectionIds: [fb], caption: "hi" });
    check("unauthenticated request is 401", r.status === 401, `got ${r.status}`);
  }
  {
    const r = await post(a, "{not json");
    check("non-JSON body is 400", r.status === 400 && r.json.error === "invalid_request", `got ${r.status}`);
  }
  {
    const r = await post(a, { workspaceId: "nope", targetConnectionIds: [], media: "x" });
    const fields = (r.json.issues ?? []).map((i) => i.field).sort();
    check(
      "malformed body reports every field",
      r.status === 400 && fields.join(",") === "media,targetConnectionIds,workspaceId",
      `${r.status} ${fields.join(",")}`,
    );
  }
  {
    const r = await post(a, { workspaceId: a.workspaceId, targetConnectionIds: [fb], caption: "", media: [] });
    check(
      "empty post is 422 invalid_content",
      r.status === 422 && r.json.issues?.[0]?.code === "nothing_to_post",
      `${r.status} ${JSON.stringify(r.json).slice(0, 120)}`,
    );
  }
  {
    const r = await post(a, {
      workspaceId: a.workspaceId,
      targetConnectionIds: [th],
      caption: "x".repeat(501),
    });
    check(
      "501-char Threads caption is 422 caption_too_long",
      r.status === 422 && r.json.issues?.[0]?.code === "caption_too_long" && r.json.issues[0].platform === "threads",
      `${r.status} ${JSON.stringify(r.json).slice(0, 120)}`,
    );
  }
  {
    // Same 501 chars, but overridden for Threads — passes validation, so it
    // gets as far as the plan check and beyond (scheduled, no publish).
    const r = await post(a, {
      workspaceId: a.workspaceId,
      targetConnectionIds: [th],
      caption: "x".repeat(501),
      platformOverrides: { threads: { caption: "short" } },
      scheduledFor: new Date(Date.now() + 86400e3).toISOString(),
    });
    check("per-platform override rescues the post", r.status === 201, `${r.status} ${JSON.stringify(r.json).slice(0, 120)}`);
  }
  {
    const r = await post(a, { workspaceId: a.workspaceId, targetConnectionIds: [x], caption: "free user on X" });
    check(
      "X on the Free plan is 403 plan_platform_locked (by API, not UI)",
      r.status === 403 && r.json.issues?.[0]?.code === "plan_platform_locked",
      `${r.status} ${JSON.stringify(r.json).slice(0, 120)}`,
    );
  }
  {
    const r = await post(a, { workspaceId: a.workspaceId, targetConnectionIds: [bConn], caption: "not mine" });
    check(
      "another tenant's connection is 422 connection_missing",
      r.status === 422 && r.json.error === "bad_targets" && r.json.issues?.[0]?.code === "connection_missing",
      `${r.status} ${JSON.stringify(r.json).slice(0, 120)}`,
    );
  }
  {
    const r = await post(a, { workspaceId: b.workspaceId, targetConnectionIds: [fb], caption: "wrong workspace" });
    check("another tenant's workspace is 404", r.status === 404, `got ${r.status}`);
  }
  {
    const r = await post(a, {
      workspaceId: a.workspaceId,
      targetConnectionIds: [fb],
      caption: "past",
      scheduledFor: new Date(Date.now() - 3600e3).toISOString(),
    });
    check("scheduling in the past is 400", r.status === 400 && r.json.issues?.[0]?.field === "scheduledFor", `got ${r.status}`);
  }

  // ── schedule → tick ────────────────────────────────────────────────────
  let scheduledId;
  {
    const r = await post(a, {
      workspaceId: a.workspaceId,
      targetConnectionIds: [fb],
      caption: `smoke scheduled ${stamp}`,
      scheduledFor: new Date(Date.now() + 3600e3).toISOString(),
    });
    scheduledId = r.json.post?.id;
    check("scheduling a valid post is 201", r.status === 201 && Boolean(scheduledId), `${r.status}`);
    const { data: row } = await a.client.from("scheduled_posts").select("status, attempt_count").eq("id", scheduledId).single();
    check("row is `scheduled` with 0 attempts", row?.status === "scheduled" && row.attempt_count === 0, JSON.stringify(row));
  }
  {
    // No secret → 403; wrong secret → 403.
    const r1 = await fetch(`${BASE}/api/internal/scheduler/tick`, { method: "POST" });
    const r2 = await fetch(`${BASE}/api/internal/scheduler/tick`, {
      method: "POST",
      headers: { authorization: "Bearer wrong" },
    });
    check("tick refuses without the secret", r1.status === 403 && r2.status === 403, `${r1.status}/${r2.status}`);
  }
  {
    // Make it due, then tick. The real Facebook adapter runs against a fake
    // token: Meta answers OAuthException → auth_error, connection → expired.
    await a.client.from("scheduled_posts").update({ scheduled_for: new Date(Date.now() - 60e3).toISOString() }).eq("id", scheduledId);
    const r = await fetch(`${BASE}/api/internal/scheduler/tick`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.SCHEDULER_SECRET}` },
    });
    const summary = await r.json();
    check(
      "tick claims and processes the due post",
      r.status === 200 && summary.claimed === 1 && summary.failed === 1,
      JSON.stringify(summary),
    );
    const { data: row } = await a.client.from("scheduled_posts").select("status, attempt_count, last_error").eq("id", scheduledId).single();
    check(
      "post settles as `failed` with the platform's reason",
      row?.status === "failed" && row.attempt_count === 1 && /facebook/i.test(row.last_error ?? ""),
      JSON.stringify(row),
    );
    const { data: hist } = await a.client.from("history").select("platform, outcome, error, detail").eq("scheduled_post_id", scheduledId);
    check(
      "history row records the failure precisely",
      hist?.length === 1 && hist[0].outcome === "failed" && hist[0].platform === "facebook" && hist[0].detail?.code === "auth_error",
      JSON.stringify(hist),
    );
    const { data: conn } = await a.client.from("connections").select("status").eq("id", fb).single();
    check("connection is marked expired after the auth error", conn?.status === "expired", JSON.stringify(conn));
    const { count } = await a.client.from("usage").select("id", { count: "exact", head: true });
    check("no usage row for a post that published nowhere", count === 0, `count=${count}`);
  }
  {
    // A tick with nothing due is quiet.
    const r = await fetch(`${BASE}/api/internal/scheduler/tick`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.SCHEDULER_SECRET}` },
    });
    const summary = await r.json();
    check("second tick finds nothing due", r.status === 200 && summary.due === 0, JSON.stringify(summary));
  }

  // ── publish now, end to end ────────────────────────────────────────────
  {
    const r = await post(a, { workspaceId: a.workspaceId, targetConnectionIds: [th], caption: `smoke now ${stamp}` });
    const target = r.json.results?.[0];
    check(
      "publish-now runs the pipeline and reports the per-target failure",
      r.status === 200 && r.json.post?.status === "failed" && target?.outcome === "failed" && target.code === "auth_error",
      `${r.status} ${JSON.stringify(r.json).slice(0, 200)}`,
    );
    const { data: conn } = await a.client.from("connections").select("status").eq("id", th).single();
    check("threads connection marked expired too", conn?.status === "expired", JSON.stringify(conn));
  }
  {
    // Now every connection is expired: the API says so before touching anything.
    const r = await post(a, { workspaceId: a.workspaceId, targetConnectionIds: [th], caption: "again" });
    check(
      "expired connection is refused up front as connection_inactive",
      r.status === 422 && r.json.issues?.[0]?.code === "connection_inactive",
      `${r.status} ${JSON.stringify(r.json).slice(0, 120)}`,
    );
  }

  // ── daily cap: enforced for now, skipped for later ─────────────────────
  {
    const fb2 = await addConnection(a, "facebook", `page2-${stamp}`, "Smoke Page 2");
    for (let i = 0; i < 2; i++) {
      const { error } = await a.client.from("usage").insert({
        user_id: a.id, workspace_id: a.workspaceId, kind: "post_publish", amount: 1,
      });
      if (error) throw new Error(`usage insert: ${error.message}`);
    }
    const now = await post(a, { workspaceId: a.workspaceId, targetConnectionIds: [fb2], caption: "third today" });
    check(
      "3rd publish-now of the day on Free is 403 posts_daily_cap",
      now.status === 403 && now.json.issues?.[0]?.code === "posts_daily_cap",
      `${now.status} ${JSON.stringify(now.json).slice(0, 120)}`,
    );
    const later = await post(a, {
      workspaceId: a.workspaceId,
      targetConnectionIds: [fb2],
      caption: "tomorrow",
      scheduledFor: new Date(Date.now() + 86400e3).toISOString(),
    });
    check("but scheduling it for tomorrow is 201", later.status === 201, `${later.status}`);
  }

  // ── pages render for the signed-in user ────────────────────────────────
  {
    const compose = await fetch(`${BASE}/dashboard/compose`, { headers: { cookie: a.cookie }, redirect: "manual" });
    const composeHtml = await compose.text();
    check("compose page renders", compose.status === 200 && composeHtml.includes("Post to"), `status ${compose.status}`);
    const posts = await fetch(`${BASE}/dashboard/posts`, { headers: { cookie: a.cookie }, redirect: "manual" });
    const postsHtml = await posts.text();
    check(
      "posts page lists the smoke posts with outcomes",
      posts.status === 200 && postsHtml.includes(`smoke scheduled ${stamp}`) && postsHtml.includes("failed"),
      `status ${posts.status}`,
    );
    const anon = await fetch(`${BASE}/dashboard/compose`, { redirect: "manual" });
    check("compose page redirects anonymous users to login", anon.status === 307 && (anon.headers.get("location") ?? "").includes("/login"), `status ${anon.status}`);
  }
} catch (err) {
  check("smoke ran to completion", false, err?.message ?? String(err));
} finally {
  for (const id of users) {
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  const { count } = await admin.from("scheduled_posts").select("id", { count: "exact", head: true }).in("user_id", users);
  check("cleanup: throwaway users and their rows are gone", (count ?? 0) === 0, `remaining=${count}`);
}

console.log(results.join("\n"));
console.log(`\n${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
