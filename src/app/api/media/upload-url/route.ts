import { NextResponse, type NextRequest } from "next/server";

import { getUser } from "@/lib/auth/session";
import { consumeRateLimit } from "@/lib/rate-limit/limit";
import { formatBytes, SINGLE_PUT_MAX_BYTES } from "@/lib/media/policy";
import {
  assertOwnWorkspace,
  checkUploadRequest,
  parseUploadContext,
  parseUploadIntent,
} from "@/lib/media/upload-request";
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
// This is the one-request path, for anything up to SINGLE_PUT_MAX_BYTES.
// Above that R2 refuses a single PUT outright and the browser goes to
// /api/media/multipart instead.
//
// Body: { workspaceId, contentType, sizeBytes, context?, intent? }
//   context — "short" | "long", what the composer said the post is; it is
//             what decides the size ceiling for a video
//   intent  — "now" | "schedule", because a file that will sit in the bucket
//             until its time comes is judged more strictly than one being
//             spent in the next minute
// 200  { uploadUrl, headers, publicUrl, key, kind }
// 400  { error: "invalid_request", message }
// 401  { error: "unauthenticated" }
// 403  { error: "workspace_not_found" }
// 403  { error: "schedule_denied", message }
// 413  { error: "rejected" | "schedule_denied", message }
// 413  { error: "use_multipart", message, threshold }
// 503  { error: "storage_not_configured", message }

export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Each presigned URL is an object somebody can push bytes into, billed to
  // our R2 account, so the handing-out is limited per user. Generous enough
  // for a ten-image carousel and its retries; far below a script.
  const limited = await consumeRateLimit("mediaUpload", user.id);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: limited.message },
      { status: 429, headers: { "retry-after": String(limited.retryAfterSeconds) } },
    );
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

  // R2, like S3, refuses a single PUT over 5GiB. Rather than hand out a
  // signature that cannot work, say so and name the other door.
  if (Number.isFinite(size) && size > SINGLE_PUT_MAX_BYTES) {
    return NextResponse.json(
      {
        error: "use_multipart",
        threshold: SINGLE_PUT_MAX_BYTES,
        message: `Files over ${formatBytes(SINGLE_PUT_MAX_BYTES)} upload in parts. Use /api/media/multipart.`,
      },
      { status: 413 },
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

  // The size is the browser's claim, used to refuse an obviously-too-large
  // file before spending a signature on it. R2 does not enforce it, so what
  // actually bounds this path is R2's own single-PUT ceiling.
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
  const check = verdict.check;

  const target = await createMediaStore().createUploadTarget({
    userId: user.id,
    workspaceId,
    contentType: contentType.split(";")[0].trim().toLowerCase(),
    extension: check.extension,
    kind: check.kind,
  });

  return NextResponse.json({ ...target, kind: check.kind });
}
