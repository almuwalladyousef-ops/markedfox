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

const GIB = 1024 * 1024 * 1024;

/**
 * What the person said they were making, which is what decides how big the
 * file may be.
 *
 * A short video and a long one are not the same product. A reel, a Short or a
 * TikTok is minutes at most and a gigabyte is already generous; a full-length
 * YouTube upload is the thing people have a 40GB export of, and capping that
 * at the same number would make the "Long video" option a lie.
 *
 * `story` rides with `short` — a story is sixty seconds.
 */
export type UploadContext = "short" | "long";

/**
 * What the file is going to be used for, which is a different question from
 * how big it may be.
 *
 * `schedule` is the expensive one: the bytes are uploaded when the button is
 * pressed and then wait in the bucket until the tick fires. Refusing at that
 * point rather than at publish time is the difference between a message and a
 * wasted upload.
 */
export type UploadIntent = "now" | "schedule";

/** Short video, story: 1GiB. */
export const MAX_SHORT_VIDEO_BYTES = 1 * GIB;

/**
 * Long video: YouTube's own ceiling, which is 256GB (or twelve hours,
 * whichever comes first — the duration side is the platform's to enforce at
 * publish, not ours to guess from a byte count).
 *
 * This is a ceiling and not a promise about anybody's uplink. What makes it
 * reachable at all is the multipart path below; a single PUT could never
 * carry it.
 */
export const MAX_LONG_VIDEO_BYTES = 256 * GIB;

/**
 * Above this, the browser uploads in parts.
 *
 * R2 (like S3) refuses a single PUT over 5GiB outright, so the threshold is
 * not a tuning choice — it is the edge of what the one-request path can do,
 * kept a gigabyte clear of the wall. Below it nothing changes: one signed
 * PUT, the path that has been carrying every upload since 2026-08-16.
 */
export const SINGLE_PUT_MAX_BYTES = 4 * GIB;

/**
 * A scheduled post may not carry a video larger than this.
 *
 * Not a storage limit — a *duration* one. Pressing Post now uploads the file
 * and spends it minutes later; pressing Schedule uploads it and then leaves it
 * sitting in the bucket until the tick fires, which may be weeks. Media is
 * transient by design in this product, and a 40GB object parked for a fortnight
 * is the one way that stops being true. Post it now, or make it smaller.
 */
export const MAX_SCHEDULED_VIDEO_BYTES = 5 * GIB;

/**
 * R2 requires every part of a multipart upload except the last to be exactly
 * the same size, and allows at most 10,000 of them. So the part size is
 * computed from the file rather than fixed: 64MiB by default, grown to
 * whatever keeps the count under the cap for a very large file.
 *
 * 64MiB is chosen for the failure case rather than the happy one — a dropped
 * part costs the user 64MiB of re-upload, and only one part is ever held in
 * the tab's memory at a time.
 */
export const MIN_PART_BYTES = 64 * 1024 * 1024;
export const MAX_PARTS = 10_000;

export function partSizeFor(sizeBytes: number): number {
  const needed = Math.ceil(sizeBytes / MAX_PARTS);
  if (needed <= MIN_PART_BYTES) return MIN_PART_BYTES;
  // Round up to a whole MiB so the number stays legible in a log line.
  const mib = 1024 * 1024;
  return Math.ceil(needed / mib) * mib;
}

export function partCountFor(sizeBytes: number, partBytes: number): number {
  return Math.max(1, Math.ceil(sizeBytes / partBytes));
}

export function maxVideoBytesFor(context: UploadContext): number {
  return context === "long" ? MAX_LONG_VIDEO_BYTES : MAX_SHORT_VIDEO_BYTES;
}

// How long a signed upload URL stays valid. Long enough for a whole file on
// a slow connection, short enough that a leaked URL is not a durable write
// grant on the bucket.
export const UPLOAD_URL_TTL_SECONDS = 30 * 60;

// The multipart part URLs get their own, much longer window. Every part is
// signed once, at the start, and a 200GB upload is a multi-hour affair — a
// thirty-minute expiry would strand it a fifth of the way through.
export const MULTIPART_URL_TTL_SECONDS = 12 * 60 * 60;

export type MediaKind = MediaRef["type"];

export type MediaCheck =
  | { ok: true; kind: MediaKind; extension: string }
  | { ok: false; reason: string };

export function checkUpload(
  contentType: string,
  sizeBytes: number,
  /** What the composer said this post is. Videos are judged against it;
   *  images are the same size wherever they are going. */
  context: UploadContext = "short",
): MediaCheck {
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

  const ceiling = maxVideoBytesFor(context);
  if (sizeBytes > ceiling) {
    return {
      ok: false,
      reason:
        context === "long"
          ? `Long videos must be under ${formatBytes(ceiling)} — that is YouTube's own ceiling. This one is ${formatBytes(sizeBytes)}.`
          : `Short videos must be under ${formatBytes(ceiling)}. This one is ${formatBytes(sizeBytes)} — pick "Long video" on the first step if that is what it is.`,
    };
  }
  return { ok: true, kind: "video", extension: videoExtension };
}

export function formatBytes(bytes: number): string {
  if (bytes >= GIB) {
    const gb = bytes / GIB;
    // One decimal below 10GB, because "1GB" and "1.9GB" are different answers
    // to "why was my file refused"; a whole number above it, because nobody
    // needs 256.0.
    return `${gb >= 10 ? Math.round(gb) : Number(gb.toFixed(1))}GB`;
  }
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
