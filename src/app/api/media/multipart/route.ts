import { NextResponse, type NextRequest } from "next/server";

import { getUser } from "@/lib/auth/session";
import {
  createMediaStore,
  isMediaStorageConfigured,
} from "@/lib/media/store";
import {
  assertOwnWorkspace,
  checkUploadRequest,
  parseUploadContext,
  parseUploadIntent,
} from "@/lib/media/upload-request";
import { createClient } from "@/lib/supabase/server";

// POST /api/media/multipart — start an upload that is too large for one PUT.
//
// The answer carries one signed URL per part, all at once. That is a
// deliberate trade: signing ten thousand URLs costs the server a few
// milliseconds of HMAC, and the alternative is ten thousand round trips
// through this route while somebody's upload waits on each one.
//
// It is also what bounds the size. Unlike a single PUT, where R2 does not
// check the length we were told, a multipart upload can only ever be as large
// as the parts we agreed to sign — so the ceiling here is enforced rather
// than merely declared.
//
// Body: { workspaceId, contentType, sizeBytes, context?, intent? }
// 200  { key, uploadId, publicUrl, partBytes, partUrls, kind }
// 400  { error: "invalid_request", message }
// 401  { error: "unauthenticated" }
// 403  { error: "workspace_not_found" | "schedule_denied", message }
// 413  { error: "rejected" | "schedule_denied", message }
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

  const { workspaceId, contentType, sizeBytes, context, intent } = (body ??
    {}) as Record<string, unknown>;
  if (typeof workspaceId !== "string" || typeof contentType !== "string") {
    return NextResponse.json(
      {
        error: "invalid_request",
        message: "workspaceId and contentType are required.",
      },
      { status: 400 },
    );
  }

  const size = Number(sizeBytes);
  if (!Number.isFinite(size) || size <= 0) {
    return NextResponse.json(
      { error: "invalid_request", message: "sizeBytes is required." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const denied = await assertOwnWorkspace(supabase, user.id, workspaceId);
  if (denied) {
    return NextResponse.json(
      { error: denied.error, message: denied.message },
      { status: denied.status },
    );
  }

  const verdict = await checkUploadRequest(supabase, user.id, {
    workspaceId,
    contentType,
    sizeBytes: size,
    context: parseUploadContext(context),
    intent: parseUploadIntent(intent),
  });
  if (!verdict.ok) {
    return NextResponse.json(
      { error: verdict.refusal.error, message: verdict.refusal.message },
      { status: verdict.refusal.status },
    );
  }

  const target = await createMediaStore().createMultipartTarget({
    userId: user.id,
    workspaceId,
    contentType: contentType.split(";")[0].trim().toLowerCase(),
    extension: verdict.check.extension,
    sizeBytes: size,
  });

  return NextResponse.json({ ...target, kind: verdict.check.kind });
}
