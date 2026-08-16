import { NextResponse, type NextRequest } from "next/server";

import { getUser } from "@/lib/auth/session";
import { createPost } from "@/lib/publish/create-post";
import { parseCreatePostRequest } from "@/lib/publish/request";
import { createClient } from "@/lib/supabase/server";

// POST /api/posts — publish now, or schedule.
//
// Body: { workspaceId, caption, media: [{url,type}], targetConnectionIds,
//         platformOverrides?: { [platform]: { caption } }, scheduledFor?: ISO }
//
// Responses:
//   201 { post: {id, status: "scheduled", scheduledFor} }
//   200 { post: {id, status}, results: [per-target outcome] }   (published now;
//         status is published / partial / failed — the request succeeded, the
//         per-platform outcomes say what actually went out)
//   400 { error: "invalid_request", issues: [{field, message}] }
//   401 { error: "unauthenticated" }
//   404 { error: "workspace_not_found" }
//   422 { error: "bad_targets" | "invalid_content", issues: [...] }
//   403 { error: "plan_denied", issues: [{platform, code, message}] }
//
// Runs as the signed-in user: RLS scopes every read and write. Route
// handlers, not Server Components, on purpose — a native client calls this
// same endpoint.

export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_request", issues: [{ field: "body", message: "Body must be JSON." }] },
      { status: 400 },
    );
  }

  const parsed = parseCreatePostRequest(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.issues },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const result = await createPost(supabase, user.id, parsed.value);

  switch (result.kind) {
    case "workspace_not_found":
      return NextResponse.json({ error: "workspace_not_found" }, { status: 404 });
    case "bad_targets":
      return NextResponse.json(
        { error: "bad_targets", issues: result.problems },
        { status: 422 },
      );
    case "invalid_content":
      return NextResponse.json(
        { error: "invalid_content", issues: result.issues },
        { status: 422 },
      );
    case "plan_denied":
      return NextResponse.json(
        { error: "plan_denied", issues: result.problems },
        { status: 403 },
      );
    case "scheduled":
      return NextResponse.json(
        {
          post: {
            id: result.post.id,
            status: "scheduled",
            scheduledFor: result.post.scheduled_for,
          },
        },
        { status: 201 },
      );
    case "published":
      return NextResponse.json(
        {
          post: { id: result.post.id, status: result.status },
          results: result.results,
        },
        { status: 200 },
      );
  }
}
