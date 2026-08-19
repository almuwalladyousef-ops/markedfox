import { NextResponse, type NextRequest } from "next/server";

import { getUser } from "@/lib/auth/session";
import { getFreshConnectionTokens } from "@/lib/connections/store";
import { PlatformApiError, PlatformAuthError } from "@/lib/platforms/errors";
import { getPlatform } from "@/lib/platforms/registry";
import { createClient } from "@/lib/supabase/server";

// GET /api/connections/:id/publish-context
//
// The live facts the composer needs before configuring a post to this
// connection — today that is TikTok's creator_info (who the post goes to,
// which privacy levels they may choose, which interactions are disabled).
// Platforms without a getPublishContext answer { context: null }.
//
// User-scoped client: RLS decides whether the connection is theirs to ask
// about; someone else's id reads as not found.
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
    if (!adapter.getPublishContext) {
      return NextResponse.json({ platform: row.platform, context: null });
    }
    const context = await adapter.getPublishContext(tokens);
    return NextResponse.json({ platform: row.platform, context });
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
    // Not theirs, or gone: the store throws on a missing row.
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
