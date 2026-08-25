import { NextResponse, type NextRequest } from "next/server";

import { getUser } from "@/lib/auth/session";
import {
  createMediaStore,
  isMediaStorageConfigured,
} from "@/lib/media/store";
import { ownsKey } from "@/lib/media/upload-request";

// POST /api/media/multipart/complete — stitch the parts into the object.
//
// The browser sends no ETags. It says which upload it finished and how many
// parts it sent; the server asks R2 what actually landed and refuses to
// assemble anything short of that. A truncated video that publishes
// successfully is a far worse outcome than an upload that fails loudly.
//
// Body: { workspaceId, key, uploadId, expectedParts }
// 200  { ok: true, publicUrl }
// 400  { error: "invalid_request", message }
// 401  { error: "unauthenticated" }
// 403  { error: "not_your_object" }
// 409  { error: "incomplete", message }   — R2 is missing parts
// 503  { error: "storage_not_configured" }

export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!isMediaStorageConfigured()) {
    return NextResponse.json(
      { error: "storage_not_configured" },
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

  const { workspaceId, key, uploadId, expectedParts } = (body ?? {}) as Record<
    string,
    unknown
  >;
  const parts = Number(expectedParts);
  if (
    typeof workspaceId !== "string" ||
    typeof key !== "string" ||
    typeof uploadId !== "string" ||
    !Number.isInteger(parts) ||
    parts < 1
  ) {
    return NextResponse.json(
      {
        error: "invalid_request",
        message: "workspaceId, key, uploadId and expectedParts are required.",
      },
      { status: 400 },
    );
  }

  // The key came back from the browser, so unlike everywhere else it is not
  // one we just minted. Its own prefix names its owner.
  if (!ownsKey(key, user.id, workspaceId)) {
    return NextResponse.json({ error: "not_your_object" }, { status: 403 });
  }

  const store = createMediaStore();
  try {
    await store.completeMultipartUpload({ key, uploadId, expectedParts: parts });
  } catch (error) {
    // The half-finished upload is abandoned rather than left to accrue
    // storage charges for parts nobody will ever assemble.
    await store.abortMultipartUpload({ key, uploadId }).catch(() => {});
    return NextResponse.json(
      {
        error: "incomplete",
        message:
          error instanceof Error
            ? error.message
            : "That upload could not be assembled. Try again.",
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true });
}
