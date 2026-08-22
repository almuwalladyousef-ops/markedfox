import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// Everything this account holds, as one JSON file.
//
// Read through the user's own client, so Row Level Security is what scopes it
// — this route never writes a `user_id` filter of its own, and a table added
// later without a policy returns nothing here rather than everything.
//
// Two things are deliberately absent. Encrypted OAuth tokens: an exported
// access token is a live credential sitting in a downloads folder, and the
// export is meant to be safe to email to yourself. And anything that is a
// cache — account profiles and media — because it is not the user's data, it
// is the platform's, and it is one refresh away from being re-read.

const TABLES: { name: string; columns: string }[] = [
  { name: "workspaces", columns: "id, name, is_default, created_at" },
  {
    name: "connections",
    columns:
      "id, workspace_id, platform, platform_account_id, platform_account_name, scopes, status, created_at",
  },
  {
    name: "scheduled_posts",
    columns:
      "id, workspace_id, caption, media, platform_overrides, target_connection_ids, status, scheduled_for, published_at, last_error, created_at",
  },
  {
    name: "history",
    columns:
      "id, scheduled_post_id, connection_id, platform, outcome, post_url, error, created_at",
  },
  {
    name: "dm_rules",
    columns:
      "id, workspace_id, connection_id, name, folder, enabled, trigger_type, keywords, target_post_ids, actions, config, created_at",
  },
  {
    name: "usage",
    columns: "id, workspace_id, kind, amount, platform, occurred_at",
  },
  { name: "subscriptions", columns: "plan_id, status, current_period_end" },
  {
    name: "research_sources",
    columns:
      "id, workspace_id, platform, external_id, handle, title, follower_count, baseline_views, created_at",
  },
  {
    name: "research_ideas",
    columns: "id, workspace_id, video_id, title, summary, status, note, created_at",
  },
  {
    name: "research_hook_templates",
    columns: "id, workspace_id, formula, example, category, favorite, created_at",
  },
];

export async function GET() {
  const user = await requireUser();
  const supabase = await createClient();

  const data: Record<string, unknown[]> = {};
  for (const table of TABLES) {
    // A table this deployment has not migrated yet is absent from the export
    // rather than failing the whole download. Logged, though: the first
    // version of this list named two columns that do not exist, and the
    // tolerance swallowed it — the table simply was not in the file, and
    // nothing said so.
    const { data: rows, error } = await supabase
      .from(table.name)
      .select(table.columns)
      .limit(5000);
    if (error) {
      console.warn(`account-export: skipped ${table.name}: ${error.message}`);
      continue;
    }
    data[table.name] = rows ?? [];
  }

  const body = JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      account: { id: user.id, email: user.email },
      note: "Encrypted platform tokens are deliberately excluded. Cached platform profiles and media are excluded because they are re-read from the platform.",
      data,
    },
    null,
    2,
  );

  return new NextResponse(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="markedfox-export.json"`,
      // Never cached: it is one person's whole account.
      "cache-control": "no-store",
    },
  });
}
