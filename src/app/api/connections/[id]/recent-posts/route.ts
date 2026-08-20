import { NextResponse, type NextRequest } from "next/server";

import { getUser } from "@/lib/auth/session";
import { getFreshConnectionTokens } from "@/lib/connections/store";
import { PlatformApiError, PlatformAuthError } from "@/lib/platforms/errors";
import { getPlatform } from "@/lib/platforms/registry";
import { createClient } from "@/lib/supabase/server";

// GET /api/connections/:id/recent-posts — the account's latest posts, so the
// rule builder can aim a comment rule at specific ones. User client → RLS.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const supabase = await createClient();
  try {
    const { row, tokens } = await getFreshConnectionTokens(supabase, id);
    const adapter = getPlatform(row.platform);
    if (!adapter.messaging) {
      return NextResponse.json({ posts: [] });
    }
    const posts = await adapter.messaging.listRecentPosts({
      tokens,
      platformAccountId: row.platform_account_id,
    });
    return NextResponse.json({ posts });
  } catch (error) {
    if (error instanceof PlatformAuthError) {
      return NextResponse.json(
        { error: "reconnect_needed", message: "Reconnect this account on the dashboard first." },
        { status: 409 },
      );
    }
    if (error instanceof PlatformApiError) {
      return NextResponse.json({ error: "platform_error", message: error.message }, { status: 502 });
    }
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
