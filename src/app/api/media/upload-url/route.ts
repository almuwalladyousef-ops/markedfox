import { NextResponse, type NextRequest } from "next/server";

import { getUser } from "@/lib/auth/session";
import { checkUpload } from "@/lib/media/policy";
import {
  createMediaStore,
  isMediaStorageConfigured,
} from "@/lib/media/store";
import { createClient } from "@/lib/supabase/server";

// POST /api/media/upload-url — hand the browser a short-lived URL to PUT one
// file straight to R2.
//
// The bytes never touch this server. On a 1 vCPU / 2GB droplet that is the
// difference between one user uploading a video and every other request
// stalling behind it.
//
// Body: { workspaceId, contentType, sizeBytes }
// 200  { uploadUrl, headers, publicUrl, key, kind }
// 400  { error: "invalid_request", message }
// 401  { error: "unauthenticated" }
// 403  { error: "workspace_not_found" }
// 413  { error: "rejected", message }   — type or size refused
// 503  { error: "storage_not_configured", message }

export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  if (!isMediaStorageConfigured()) {
    return NextResponse.json(
      {
        error: "storage_not_configured",
        message:
          "File upload is not switched on yet. Paste a public link to the image or video instead.",
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_request", message: "Body must be JSON." },
      { status: 400 },
    );
  }

  const { workspaceId, contentType, sizeBytes } = (body ?? {}) as Record<
    string,
    unknown
  >;
  if (typeof workspaceId !== "string" || typeof contentType !== "string") {
    return NextResponse.json(
      {
        error: "invalid_request",
        message: "workspaceId and contentType are required.",
      },
      { status: 400 },
    );
  }

  // The size is the browser's claim, used to refuse an obviously-too-large
  // file before spending a signature on it. R2 is not bound by it, so the
  // real ceiling is the bucket's — a Phase 6 item alongside video minutes.
  const size = Number(sizeBytes);
  const check = checkUpload(contentType, size);
  if (!check.ok) {
    return NextResponse.json(
      { error: "rejected", message: check.reason },
      { status: 413 },
    );
  }

  // The workspace must be the user's: the object key embeds both ids, so this
  // is what stops one tenant writing under another's prefix.
  const supabase = await createClient();
  const { data: workspace, error } = await supabase
    .from("workspaces")
    .select("id")
    .eq("id", workspaceId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!workspace) {
    return NextResponse.json({ error: "workspace_not_found" }, { status: 403 });
  }

  const target = await createMediaStore().createUploadTarget({
    userId: user.id,
    workspaceId,
    contentType: contentType.split(";")[0].trim().toLowerCase(),
    extension: check.extension,
    kind: check.kind,
  });

  return NextResponse.json({ ...target, kind: check.kind });
}
