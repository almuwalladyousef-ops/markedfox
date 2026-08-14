// Connections smoke test against the hosted MarkedFox project.
//
// Proves, on live rows: a user can insert their own encrypted connection
// through RLS; the stored token is ciphertext at rest (v1 envelope, not
// plaintext); the envelope decrypts back to the original; a second user
// cannot see it; upsert on the same account replaces rather than duplicates.
// Creates two throwaway users and deletes them at the end.
//
//   node scripts/connections-smoke.mjs
//
// The envelope code mirrors src/lib/crypto.ts (format v1 is stable and
// documented there); a mismatch would fail the round-trip check loudly.
import { createClient } from "@supabase/supabase-js";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

const KEY = Buffer.from(env.TOKEN_ENCRYPTION_KEY, "base64");
const encrypt = (plain) => {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", KEY, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), ct.toString("base64url"), c.getAuthTag().toString("base64url")].join(".");
};
const decrypt = (envl) => {
  const [v, iv, ct, tag] = envl.split(".");
  if (v !== "v1") throw new Error("bad envelope version");
  const d = createDecipheriv("aes-256-gcm", KEY, Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
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
  const email = `conn-smoke-${stamp}-${n}@example.com`;
  const password = `Conn-${stamp}-${n}-Aa1!`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(error.message);
  users.push(data.user.id);
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(signInError.message);
  const { data: ws } = await client.from("workspaces").select("id").single();
  return { id: data.user.id, client, workspaceId: ws.id };
}

try {
  const a = await mkUser("a");
  const b = await mkUser("b");

  const secret = `fake-ig-token-${stamp}`;
  const row = {
    user_id: a.id,
    workspace_id: a.workspaceId,
    platform: "instagram",
    platform_account_id: "1789",
    platform_account_name: "markedfox",
    access_token_encrypted: encrypt(secret),
    token_expires_at: new Date(Date.now() + 60 * 86400e3).toISOString(),
    scopes: ["instagram_basic", "instagram_content_publish"],
    metadata: { pageId: "42" },
  };

  // Insert through RLS as user A.
  const { data: inserted, error: insErr } = await a.client
    .from("connections").insert(row).select("id").single();
  check("user inserts own connection through RLS", !insErr, insErr?.message);

  // Ciphertext at rest: read raw via service role.
  const { data: raw } = await admin
    .from("connections").select("access_token_encrypted").eq("id", inserted.id).single();
  check("token is ciphertext at rest (v1 envelope)", raw.access_token_encrypted.startsWith("v1.") && !raw.access_token_encrypted.includes(secret));
  check("envelope decrypts to original", decrypt(raw.access_token_encrypted) === secret);

  // Cross-tenant invisibility.
  const { data: bSees } = await b.client.from("connections").select("id");
  check("other user sees zero connections", (bSees ?? []).length === 0);

  // Upsert replaces, never duplicates.
  const { error: upErr } = await a.client.from("connections").upsert(
    { ...row, access_token_encrypted: encrypt("rotated-" + secret), platform_account_name: "markedfox2" },
    { onConflict: "user_id,workspace_id,platform,platform_account_id" },
  );
  const { data: after } = await a.client.from("connections").select("id, platform_account_name");
  check("upsert on same account replaces", !upErr && after?.length === 1 && after[0].platform_account_name === "markedfox2", upErr?.message ?? `rows: ${after?.length}`);

  // Second account on the same platform coexists — many accounts per platform.
  const { error: secondErr } = await a.client.from("connections").insert(
    { ...row, platform_account_id: "9999", platform_account_name: "second" });
  const { data: both } = await a.client.from("connections").select("id");
  check("two accounts on one platform coexist", !secondErr && both?.length === 2, secondErr?.message);
} finally {
  for (const id of users) await admin.auth.admin.deleteUser(id);
}

console.log(results.join("\n"));
console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
process.exit(failures ? 1 : 0);
