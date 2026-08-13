// RLS smoke test against the hosted Markedfox project.
// Proves: signup trigger fires; cross-tenant reads return empty; authenticated
// users cannot write subscriptions; plans readable with anon key; usage rows
// cannot be deleted. Creates two throwaway users, deletes them at the end.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SERVICE = env.SUPABASE_SECRET_KEY;

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const results = [];
let failures = 0;

function check(name, ok, detail = "") {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
}

async function main() {
  // ── plans readable with anon key ──
  const anonClient = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data: plans, error: plansErr } = await anonClient.from("plans").select("id, is_public").order("id");
  check("plans readable with anon key", !plansErr && plans?.length === 4, plansErr?.message ?? `rows: ${plans?.map((p) => p.id).join(",")}`);
  check("studio is public, enterprise hidden",
    plans?.find((p) => p.id === "studio")?.is_public === true &&
    plans?.find((p) => p.id === "enterprise")?.is_public === false);

  // ── create two throwaway users ──
  const stamp = Math.random().toString(36).slice(2, 8);
  const mk = async (n) => {
    const { data, error } = await admin.auth.admin.createUser({
      email: `rls-smoke-${stamp}-${n}@example.com`,
      password: `Smoke-${stamp}-${n}-Aa1!`,
      email_confirm: true,
    });
    if (error) throw new Error(`createUser ${n}: ${error.message}`);
    return data.user;
  };
  const userA = await mk("a");
  const userB = await mk("b");

  try {
    // ── signup trigger proof ──
    const { data: rowsA } = await admin.from("users").select("id").eq("id", userA.id);
    const { data: wsA } = await admin.from("workspaces").select("id").eq("owner_id", userA.id);
    const { data: subA } = await admin.from("subscriptions").select("plan_id, status").eq("user_id", userA.id);
    check("trigger created users row", rowsA?.length === 1);
    check("trigger created default workspace", wsA?.length === 1);
    check("trigger created free subscription", subA?.[0]?.plan_id === "free" && subA?.[0]?.status === "active");

    // ── signed-in clients ──
    const signIn = async (n, email) => {
      const c = createClient(URL_, ANON, { auth: { persistSession: false } });
      const { error } = await c.auth.signInWithPassword({ email, password: `Smoke-${stamp}-${n}-Aa1!` });
      if (error) throw new Error(`signIn ${n}: ${error.message}`);
      return c;
    };
    const clientA = await signIn("a", userA.email);
    const clientB = await signIn("b", userB.email);
    const workspaceA = wsA[0].id;

    // ── user A inserts a scheduled post + usage row ──
    const { data: postA, error: postErr } = await clientA
      .from("scheduled_posts")
      .insert({ user_id: userA.id, workspace_id: workspaceA, caption: "tenant A draft" })
      .select("id")
      .single();
    check("A inserts own scheduled_post", !postErr, postErr?.message);
    const { error: usageErr } = await clientA
      .from("usage")
      .insert({ user_id: userA.id, workspace_id: workspaceA, kind: "post_publish" });
    check("A inserts own usage row", !usageErr, usageErr?.message);

    // ── cross-tenant reads: B must see nothing of A ──
    for (const table of ["users", "workspaces", "connections", "scheduled_posts", "history", "dm_rules", "usage", "subscriptions"]) {
      const col = table === "users" ? "id" : table === "workspaces" ? "owner_id" : "user_id";
      const { data, error } = await clientB.from(table).select("*").eq(col, userA.id);
      check(`B reading A's ${table} returns empty`, !error && (data?.length ?? 0) === 0, error?.message ?? `got ${data?.length} rows`);
    }

    // ── B cannot write into A's tenancy ──
    const { error: forgeErr } = await clientB
      .from("scheduled_posts")
      .insert({ user_id: userA.id, workspace_id: workspaceA, caption: "forged" });
    check("B inserting into A's workspace is refused", !!forgeErr, forgeErr ? undefined : "insert succeeded!");

    // ── authenticated cannot write subscriptions ──
    const { error: subInsErr } = await clientB
      .from("subscriptions")
      .insert({ user_id: userB.id, plan_id: "pro" });
    check("authenticated insert into subscriptions refused", !!subInsErr);
    const { data: subUpd, error: subUpdErr } = await clientB
      .from("subscriptions")
      .update({ plan_id: "pro" })
      .eq("user_id", userB.id)
      .select();
    check("authenticated update of subscriptions is a no-op", !!subUpdErr || (subUpd?.length ?? 0) === 0);
    const { data: subAfter } = await admin.from("subscriptions").select("plan_id").eq("user_id", userB.id);
    check("B still on free after update attempt", subAfter?.[0]?.plan_id === "free");

    // ── usage rows cannot be deleted by their owner ──
    const { data: usageDel, error: usageDelErr } = await clientA
      .from("usage")
      .delete()
      .eq("user_id", userA.id)
      .select();
    check("A cannot delete own usage rows", !!usageDelErr || (usageDel?.length ?? 0) === 0);

    // ── plans not writable with anon/authenticated ──
    const { data: planUpd, error: planUpdErr } = await clientA
      .from("plans")
      .update({ price_monthly_cents: 1 })
      .eq("id", "pro")
      .select();
    check("authenticated cannot edit plans", !!planUpdErr || (planUpd?.length ?? 0) === 0);
  } finally {
    await admin.auth.admin.deleteUser(userA.id);
    await admin.auth.admin.deleteUser(userB.id);
  }

  // deletion cascade proof
  const { data: leftover } = await admin.from("users").select("id").in("id", [userA.id, userB.id]);
  check("throwaway users fully removed (cascade)", (leftover?.length ?? 0) === 0);

  console.log(results.join("\n"));
  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.log(results.join("\n"));
  console.error("ABORTED:", e.message);
  process.exit(1);
});
