#!/usr/bin/env node
//
// meta — read MarkedFox's Meta app state from the command line.
//
//   node scripts/meta.mjs status              full prerequisite checklist
//   node scripts/meta.mjs apps                apps this token can see
//   node scripts/meta.mjs webhooks            webhook topics and subscriptions
//   node scripts/meta.mjs docs <query>        search Meta developer docs
//   node scripts/meta.mjs tools               list every MCP tool
//   node scripts/meta.mjs call <tool> <json>  escape hatch for anything else
//   node scripts/meta.mjs redirects           show Facebook Login redirect URIs
//   node scripts/meta.mjs redirects add <url> add one (Graph API write)
//
// Why this exists rather than `claude mcp`: the Claude Code MCP client times
// out against mcp.facebook.com and never loads its tools, but the server
// answers a normal initialize in well under a second using the OAuth token
// Claude Code already stored. This talks to it directly. If the client is ever
// fixed, this becomes redundant rather than wrong.
//
// Mostly read-only. The one write is `redirects add`, which uses the Graph
// API with the app token (needs "Allow API Access to App Settings" switched on
// in the app's advanced settings — the owner did that 2026-08-16). Note this
// reaches the main app's Facebook Login list only: the Threads use case is a
// separate app object that rejects app tokens, so its redirect list stays a
// dashboard task. Everything else it reports as not done — verification,
// Advanced Access, permissions — is a dashboard flow with no API behind it.

import { execFileSync } from "node:child_process";

const SERVICE = "Claude Code-credentials";
const SERVER_PREFIX = "meta_developer_tools";

// ── credentials ─────────────────────────────────────────────────────────────

function loadToken() {
  let raw;
  try {
    raw = execFileSync("security", ["find-generic-password", "-s", SERVICE, "-w"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    fail(
      "Could not read the keychain entry for Claude Code.",
      "Sign in once with: claude mcp login meta_developer_tools",
    );
  }

  const entry = Object.entries(JSON.parse(raw).mcpOAuth ?? {}).find(([k]) =>
    k.startsWith(SERVER_PREFIX),
  )?.[1];

  if (!entry?.accessToken) {
    fail(
      "No stored Meta MCP token.",
      "Sign in once with: claude mcp login meta_developer_tools",
    );
  }

  // expiresAt is milliseconds in current builds; tolerate seconds too.
  const exp = entry.expiresAt ?? 0;
  const nowMs = Date.now();
  const expMs = exp > 1e12 ? exp : exp * 1000;
  if (exp && expMs < nowMs) {
    fail(
      "The stored Meta MCP token has expired.",
      "Re-authenticate with: claude mcp login meta_developer_tools",
    );
  }

  return { url: entry.serverUrl, token: entry.accessToken };
}

function fail(message, hint) {
  console.error(`\n  ${message}`);
  if (hint) console.error(`  ${hint}`);
  console.error("");
  process.exit(1);
}

// ── MCP transport ───────────────────────────────────────────────────────────

const { url: SERVER_URL, token: TOKEN } = loadToken();
let sessionId = null;

async function rpc(method, params, id = 1) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${TOKEN}`,
    "MCP-Protocol-Version": "2025-06-18",
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;

  const response = await fetch(SERVER_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) }),
    signal: AbortSignal.timeout(90_000),
  });

  if (response.headers.get("mcp-session-id")) {
    sessionId = response.headers.get("mcp-session-id");
  }
  if (!response.ok) {
    fail(`Meta returned HTTP ${response.status}`, (await response.text()).slice(0, 300));
  }

  const body = await response.text();
  // Responses come back as SSE regardless of the Accept header.
  const line = body.split("\n").find((l) => l.startsWith("data: "));
  return JSON.parse(line ? line.slice(6) : body);
}

async function connect() {
  await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "markedfox-cli", version: "1.0" },
  });
  // Required by the spec before normal requests are served; failure is not fatal.
  await fetch(SERVER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${TOKEN}`,
      "MCP-Protocol-Version": "2025-06-18",
      ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  }).catch(() => {});
}

async function callTool(name, args = {}) {
  const out = await rpc("tools/call", { name, arguments: args }, 3);
  if (out.error) return { error: out.error.message ?? JSON.stringify(out.error) };

  const text = out.result?.content?.[0]?.text;
  if (!text) return { error: "empty response" };
  try {
    return JSON.parse(text).data ?? JSON.parse(text);
  } catch {
    // Meta sometimes emits invalid escapes in doc payloads. Return the raw text
    // rather than throwing — callers that only want prose can still use it.
    return { raw: text };
  }
}

// ── output helpers ──────────────────────────────────────────────────────────

const tick = (ok) => (ok ? "[32m✓[0m" : "[31m✗[0m");
const dim = (s) => `[2m${s}[0m`;
const bold = (s) => `[1m${s}[0m`;

function row(ok, label, detail = "") {
  console.log(`  ${tick(ok)} ${label.padEnd(34)} ${detail ? dim(detail) : ""}`);
}

// ── commands ────────────────────────────────────────────────────────────────

async function resolveAppId() {
  if (process.env.META_APP_ID) return process.env.META_APP_ID;
  const apps = await callTool("devtools_app_list", { action: "list" });
  const first = apps?.apps?.[0];
  if (!first) fail("No Meta apps visible to this token.");
  return first.app_id;
}

async function cmdStatus() {
  const appId = await resolveAppId();
  const [basic, review, requirements, compliance, privileges] = await Promise.all([
    callTool("devtools_app", { action: "basic_settings", app_id: appId }),
    callTool("devtools_app_review", { action: "status", app_id: appId }),
    callTool("devtools_app_review", { action: "requirements", app_id: appId }),
    callTool("devtools_compliance", { action: "status", app_id: appId }),
    callTool("devtools_app_review", { action: "privileges", app_id: appId }),
  ]);

  console.log(`\n${bold(basic.name ?? "app")}  ${dim(appId)}`);
  console.log(dim(`  ${basic.app_status ?? "?"} · live: ${basic.is_live ? "yes" : "no"} · compliance: ${compliance.overall_status ?? "?"}\n`));

  console.log(bold("  Business Verification"));
  const bv = requirements?.app_settings_valid?.business_verification_passes;
  row(bv === true, "verification passes", bv === true ? "" : "file it in Business Manager Security Center");

  console.log(`\n${bold("  Permissions")}`);
  const privs = privileges?.privileges ?? [];
  row(privs.length > 0, "advanced access requested", privs.length ? `${privs.length} granted/requested` : "none — this is what triggers verification");
  if (privs.length) {
    for (const p of privs.slice(0, 12)) {
      console.log(dim(`      · ${typeof p === "string" ? p : JSON.stringify(p)}`));
    }
  }
  const rejections = privileges?.rejections ?? [];
  if (rejections.length) {
    console.log(`  ${tick(false)} ${"rejections".padEnd(34)} ${dim(rejections.length + " — read before resubmitting")}`);
  }

  // The scopes each adapter actually requests at OAuth time. A scope missing
  // from the app's privilege list bounces every user off the consent screen
  // with "Invalid Scopes" — found the hard way with pages_manage_posts.
  const NEEDED = {
    instagram: ["instagram_basic", "instagram_content_publish", "pages_show_list", "pages_read_engagement", "business_management"],
    facebook: ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "business_management"],
    threads: ["threads_basic", "threads_content_publish"],
  };
  const have = new Set(privs.map((p) => (typeof p === "string" ? p : p.name)));
  console.log(`\n${bold("  OAuth scopes each adapter needs")}`);
  for (const [platform, scopes] of Object.entries(NEEDED)) {
    const missing = scopes.filter((s) => !have.has(s));
    row(missing.length === 0, platform, missing.length ? `missing: ${missing.join(", ")} — request on the permissions page` : "all requested");
  }

  console.log(`\n${bold("  Phase 5 filing prerequisites")}`);
  row(Boolean(basic.privacy_policy_url), "privacy policy URL", basic.privacy_policy_url ?? "");
  row(Boolean(basic.terms_of_service_url), "terms of service URL", basic.terms_of_service_url ?? "");
  row(Boolean(basic.data_deletion_url), "data deletion callback", basic.data_deletion_url ?? "Meta requires this");
  row(Boolean(basic.support_url), "support URL", basic.support_url ?? "");
  row(Boolean(basic.app_icon_url), "app icon", "");
  row(Boolean(basic.description), "description", "");
  row(Boolean(basic.contact_email_verified), "contact email verified", basic.contact_email ?? "");

  console.log(`\n${bold("  App Review")}`);
  row(review.submission_status !== "NO_SUBMISSION", "submitted", review.submission_status ?? "");
  row(compliance.overall_status === "compliant", "compliant", `${compliance.violations?.open_violation_count ?? 0} open violations`);

  const actions = compliance.required_actions ?? [];
  if (actions.length) {
    console.log(`\n${bold("  Required actions")}`);
    for (const a of actions) console.log(`    · ${typeof a === "string" ? a : JSON.stringify(a)}`);
  }

  console.log(`\n${bold("  Do these in the dashboard — no API exists for them")}`);
  console.log(dim(`    products + advanced access  https://developers.facebook.com/apps/${appId}/app-review/permissions/`));
  console.log(dim(`    business verification       https://business.facebook.com/settings/security`));
  console.log(dim(`    basic settings              https://developers.facebook.com/apps/${appId}/settings/basic/`));
  console.log("");

  // Non-zero when a launch-blocking prerequisite is unmet, so this is usable
  // as a check in a script rather than only by eye.
  process.exitCode = bv === true ? 0 : 1;
}

async function cmdRedirects(sub, url) {
  const appId = process.env.META_APP_ID;
  const secret = process.env.META_APP_SECRET;
  if (!appId || !secret) fail("META_APP_ID and META_APP_SECRET must be in the environment (source .env.local).");
  const token = `${appId}|${secret}`;
  const base = `https://graph.facebook.com/v26.0/${appId}`;

  const current = await callTool("devtools_app", { action: "advanced_settings", app_id: appId });
  const uris = current?.oauth_redirect_uris ?? [];

  if (sub === "add") {
    if (!url) fail("Usage: node scripts/meta.mjs redirects add <https://…>");
    if (uris.includes(url)) { console.log(`already present: ${url}`); return; }
    const body = new URLSearchParams({
      access_token: token,
      valid_oauth_redirect_uris: JSON.stringify([...uris, url]),
    });
    const res = await fetch(base, { method: "POST", body }).then((r) => r.json());
    if (res.error) fail(`Meta refused: ${res.error.message}`);
    console.log(`added: ${url}`);
    return;
  }

  console.log(bold("Facebook Login — valid OAuth redirect URIs"));
  for (const u of uris) console.log(`  ${u}`);
  console.log(dim(`\n  Threads keeps its own list under Use cases → Threads → Settings; not reachable by API.`));
}

async function cmdApps() {
  const apps = await callTool("devtools_app_list", { action: "list" });
  for (const a of apps?.apps ?? []) {
    console.log(`${a.app_id}  ${a.name}  ${dim(`${a.role} · ${(a.caller_permissions ?? []).join("+")}`)}`);
  }
}

async function cmdWebhooks() {
  const appId = await resolveAppId();
  const subs = await callTool("devtools_webhook_list", { action: "list_subscriptions", app_id: appId });
  console.log(JSON.stringify(subs, null, 1).slice(0, 4000));
}

async function cmdDocs(query) {
  if (!query) fail("Usage: node scripts/meta.mjs docs <query>");
  const res = await callTool("devtools_discovery", { action: "search_docs", query });
  const results = res?.results ?? [];
  if (!results.length && res.raw) {
    // Salvage titles and URLs when Meta's payload will not parse as JSON.
    for (const m of res.raw.matchAll(/"title":"(.*?)","url":"(.*?)"/g)) {
      console.log(`- ${m[1]}\n  ${m[2].replace(/\\\//g, "/")}`);
    }
    return;
  }
  for (const r of results.slice(0, 8)) console.log(`- ${r.title}\n  ${r.url}`);
}

async function cmdTools() {
  const out = await rpc("tools/list", {}, 2);
  for (const t of out.result?.tools ?? []) {
    console.log(`${t.name}\n  ${dim((t.description ?? "").slice(0, 140))}`);
  }
}

async function cmdCall(name, json) {
  if (!name) fail("Usage: node scripts/meta.mjs call <tool> '<json args>'");
  console.log(JSON.stringify(await callTool(name, json ? JSON.parse(json) : {}), null, 1).slice(0, 8000));
}

// ── entry ───────────────────────────────────────────────────────────────────

const [command, ...rest] = process.argv.slice(2);
await connect();

switch (command ?? "status") {
  case "status": await cmdStatus(); break;
  case "apps": await cmdApps(); break;
  case "redirects": await cmdRedirects(rest[0], rest[1]); break;
  case "webhooks": await cmdWebhooks(); break;
  case "docs": await cmdDocs(rest.join(" ")); break;
  case "tools": await cmdTools(); break;
  case "call": await cmdCall(rest[0], rest[1]); break;
  default:
    console.log(`Unknown command: ${command}\n`);
    console.log("  status | apps | redirects [add <url>] | webhooks | docs <query> | tools | call <tool> <json>");
    process.exit(1);
}
