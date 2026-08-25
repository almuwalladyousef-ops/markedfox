import { NextResponse, type NextRequest } from "next/server";

import { getUser } from "@/lib/auth/session";
import {
  createMediaStore,
  isMediaStorageConfigured,
} from "@/lib/media/store";
import { ownsKey } from "@/lib/media/upload-request";

// POST /api/media/multipart/abort — throw away an upload that was cancelled.
//
// R2 charges for parts that were uploaded and never assembled, and nothing
// sweeps them: the orphan pass in the scheduler lists finished objects, and an
// incomplete multipart upload is not one. So the composer says so when the
// person walks away, and this is where that lands.
//
// Best effort by design — a failure here is not something to show anybody.

export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!isMediaStorageConfigured()) {
    return NextResponse.json({ ok: true });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const { workspaceId, key, uploadId } = (body ?? {}) as Record<string, unknown>;
  if (
    typeof workspaceId !== "string" ||
    typeof key !== "string" ||
    typeof uploadId !== "string" ||
    !ownsKey(key, user.id, workspaceId)
  ) {
    return NextResponse.json({ ok: true });
  }

  await createMediaStore()
    .abortMultipartUpload({ key, uploadId })
    .catch(() => {});
  return NextResponse.json({ ok: true });
}
