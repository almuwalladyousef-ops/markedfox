import type { MediaRef } from "@/lib/platforms/types";

// What may be uploaded, and under what object key. Pure: the composer checks
// a file before it starts uploading and the API checks the same numbers before
// it signs anything, exactly as validateContent is shared by both.
//
// These are OUR ceilings, not the platforms'. Per-platform rules (caption
// limits, carousel size, mixing) stay in each adapter and run in
// validateContent; what is here is "will we store this at all", which is a
// cost question rather than a publishing one.

export const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const VIDEO_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};

// Instagram rejects images over 8MB, so a larger one could be stored and then
// fail at publish — refusing it up front is the whole "surfaced before
// publish, never as an error after" rule applied to media.
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 300 * 1024 * 1024;

// How long a signed upload URL stays valid. Long enough for a 300MB video on
// a slow connection, short enough that a leaked URL is not a durable write
// grant on the bucket.
export const UPLOAD_URL_TTL_SECONDS = 30 * 60;

export type MediaKind = MediaRef["type"];

export type MediaCheck =
  | { ok: true; kind: MediaKind; extension: string }
  | { ok: false; reason: string };

export function checkUpload(contentType: string, sizeBytes: number): MediaCheck {
  const type = contentType.split(";")[0].trim().toLowerCase();

  const imageExtension = IMAGE_TYPES[type];
  const videoExtension = VIDEO_TYPES[type];
  if (!imageExtension && !videoExtension) {
    return {
      ok: false,
      reason:
        "That file type is not supported. Use a JPEG, PNG, or WebP image, or an MP4 or MOV video.",
    };
  }

  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { ok: false, reason: "That file looks empty." };
  }

  if (imageExtension) {
    if (sizeBytes > MAX_IMAGE_BYTES) {
      return {
        ok: false,
        reason: `Images must be under ${formatBytes(MAX_IMAGE_BYTES)} — Instagram refuses anything larger. This one is ${formatBytes(sizeBytes)}.`,
      };
    }
    return { ok: true, kind: "image", extension: imageExtension };
  }

  if (sizeBytes > MAX_VIDEO_BYTES) {
    return {
      ok: false,
      reason: `Videos must be under ${formatBytes(MAX_VIDEO_BYTES)}. This one is ${formatBytes(sizeBytes)}.`,
    };
  }
  return { ok: true, kind: "video", extension: videoExtension };
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes} bytes`;
}

// Object keys are ours, never the user's filename: a name from a browser can
// carry path separators, control characters, or another tenant's id. The
// user/workspace prefix makes an orphan sweep straightforward later, and the
// random component makes collisions impossible without a lookup.
export function buildObjectKey(input: {
  userId: string;
  workspaceId: string;
  extension: string;
  random: string;
}): string {
  return `${input.userId}/${input.workspaceId}/${input.random}.${input.extension}`;
}

// The public URL a platform will fetch. R2's public base is either the r2.dev
// subdomain or a custom domain; either way the key is appended verbatim.
export function publicUrlFor(baseUrl: string, key: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${key}`;
}
