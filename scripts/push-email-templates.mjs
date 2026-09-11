// Pushes the auth email templates in supabase/email-templates/ to the hosted
// project through the Supabase Management API, then reads them back.
//
//   node scripts/push-email-templates.mjs           → push and verify
//   node scripts/push-email-templates.mjs --check   → read back only
//
// Why these templates exist. Supabase's default templates link to
// `{{ .ConfirmationURL }}`, which is a Supabase-hosted URL that verifies the
// token there and then redirects to our site carrying a PKCE `?code=` — a code
// that can only be exchanged from the browser that started the signup, and
// that our confirmation route does not read. Every link therefore landed on
// /login?error=invalid_link. The route at src/app/auth/confirm/route.ts expects
// the link itself to carry `token_hash` and `type`, verified server-side, which
// also works when the email is opened on a different device. These templates
// build exactly that link.
//
// BLOCKED until a custom SMTP provider is set on the project: Supabase refuses
// template edits on the free tier with its built-in mailer ("Email template
// modification is not available for free tier projects using the default email
// provider"). Until then the confirmation route handles the default `?code=`
// links, which is enough for the flows to work in the browser that started
// them. The built-in mailer is also capped at 2 emails an hour for the whole
// project, which a launch burst cannot live with either.
//
// The dashboard holds the live copy and nothing in the repo would otherwise
// record what it must say, so this script is the source of truth. A project
// restored from backup, or a fresh project, needs it run once.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const TEMPLATES = {
  mailer_templates_confirmation_content: "confirmation.html",
  mailer_templates_recovery_content: "recovery.html",
  mailer_templates_magic_link_content: "magic-link.html",
  mailer_templates_email_change_content: "email-change.html",
};

const ref =
  process.env.SUPABASE_PROJECT_REF ??
  readFileSync(new URL("../supabase/.temp/project-ref", import.meta.url), "utf8").trim();

const token =
  process.env.SUPABASE_ACCESS_TOKEN ??
  // Where `supabase login` keeps it on macOS.
  execFileSync("security", ["find-generic-password", "-s", "Supabase CLI", "-w"], {
    encoding: "utf8",
  }).trim();

const endpoint = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };

const wanted = Object.fromEntries(
  Object.entries(TEMPLATES).map(([key, file]) => [
    key,
    readFileSync(new URL(`../supabase/email-templates/${file}`, import.meta.url), "utf8").trim(),
  ]),
);

if (!process.argv.includes("--check")) {
  const res = await fetch(endpoint, { method: "PATCH", headers, body: JSON.stringify(wanted) });
  if (!res.ok) throw new Error(`PATCH ${res.status}: ${await res.text()}`);
  console.log(`pushed ${Object.keys(wanted).length} templates to ${ref}`);
}

const live = await (await fetch(endpoint, { headers })).json();
let failed = 0;
for (const [key, file] of Object.entries(TEMPLATES)) {
  const ok = (live[key] ?? "").trim() === wanted[key];
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "DIFF"} ${file}`);
}
console.log(`site_url=${live.site_url}  smtp_host=${live.smtp_host ?? "(built-in mailer)"}  emails/hour=${live.rate_limit_email_sent}`);
if (failed) process.exit(1);
