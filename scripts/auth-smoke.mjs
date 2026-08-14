// Auth smoke test against the hosted MarkedFox project.
//
// Creates one confirmed throwaway user so the browser flow (sign in, protected
// dashboard, sign out) can be driven end to end without waiting on a real
// confirmation email, then deletes it.
//
//   node scripts/auth-smoke.mjs create   → prints the credentials
//   node scripts/auth-smoke.mjs cleanup  → removes every auth-smoke-* user
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const PREFIX = "auth-smoke-";

async function create() {
  const stamp = Math.random().toString(36).slice(2, 8);
  const email = `${PREFIX}${stamp}@example.com`;
  const password = `Smoke-${stamp}-Aa1!`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser: ${error.message}`);

  // The signup trigger should have provisioned all three rows.
  const [{ data: userRow }, { data: workspace }, { data: subscription }] =
    await Promise.all([
      admin.from("users").select("id, email").eq("id", data.user.id).maybeSingle(),
      admin.from("workspaces").select("id, name").eq("owner_id", data.user.id).maybeSingle(),
      admin.from("subscriptions").select("plan_id, status").eq("user_id", data.user.id).maybeSingle(),
    ]);

  console.log(`EMAIL=${email}`);
  console.log(`PASSWORD=${password}`);
  console.log(`users row:        ${userRow ? "yes" : "MISSING"}`);
  console.log(`workspace row:    ${workspace ? `yes (${workspace.name})` : "MISSING"}`);
  console.log(`subscription row: ${subscription ? `yes (${subscription.plan_id}/${subscription.status})` : "MISSING"}`);
}

async function cleanup() {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (error) throw new Error(`listUsers: ${error.message}`);

  const stale = data.users.filter((u) => u.email?.startsWith(PREFIX));
  for (const user of stale) {
    const { error: delError } = await admin.auth.admin.deleteUser(user.id);
    console.log(`${delError ? "FAILED" : "deleted"} ${user.email}${delError ? ` — ${delError.message}` : ""}`);
  }
  if (stale.length === 0) console.log("no auth-smoke users to remove");
}

const command = process.argv[2];
if (command === "create") await create();
else if (command === "cleanup") await cleanup();
else {
  console.error("usage: node scripts/auth-smoke.mjs create|cleanup");
  process.exit(1);
}
