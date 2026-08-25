import "server-only";

import { randomBytes } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { requireEnv } from "@/lib/env";

import {
  buildObjectKey,
  MAX_PARTS,
  MULTIPART_URL_TTL_SECONDS,
  partCountFor,
  partSizeFor,
  publicUrlFor,
  UPLOAD_URL_TTL_SECONDS,
  type MediaKind,
} from "./policy";
import type {
  MediaPurgeStore,
  PurgeablePost,
  StoredObject,
} from "./purge";
import { presignUrl } from "./sigv4";
import { decodeXml, escapeXml } from "./xml";

// Object storage for media awaiting publish.
//
// Cloudflare R2 behind the S3 API. The interface is what the rest of the app
// talks to, so moving to another provider is this file and nothing else —
// the same bet the platform adapters make.
//
// Media is transient by design (CLAUDE.md): the platforms fetch it once at
// publish time and it is deleted afterwards, which is why the bucket is
// public-read and why nothing durable ever lives here.

export type UploadTarget = {
  /** Where the browser PUTs the bytes. Expires; see UPLOAD_URL_TTL_SECONDS. */
  uploadUrl: string;
  /** Headers the browser must send, because they are covered by the signature. */
  headers: Record<string, string>;
  /** Where the platforms will fetch it from. This is what goes in the post. */
  publicUrl: string;
  /** Object key, kept so the object can be deleted after publish. */
  key: string;
};

/**
 * A file too large for one request, signed up front as a run of parts.
 *
 * Every part URL is handed out at the start rather than one at a time. It
 * costs one round trip instead of ten thousand, and it means an upload that
 * loses the connection for a minute can carry on where it stopped without
 * asking us for anything.
 */
export type MultipartTarget = {
  key: string;
  uploadId: string;
  publicUrl: string;
  /** Every part but the last is exactly this many bytes — R2 requires it. */
  partBytes: number;
  /** One signed PUT per part, in order. `partUrls.length` is the part count. */
  partUrls: string[];
};

export interface MediaStore {
  createUploadTarget(input: {
    userId: string;
    workspaceId: string;
    contentType: string;
    extension: string;
    kind: MediaKind;
  }): Promise<UploadTarget>;
  /** The same thing for a file over SINGLE_PUT_MAX_BYTES. */
  createMultipartTarget(input: {
    userId: string;
    workspaceId: string;
    contentType: string;
    extension: string;
    sizeBytes: number;
  }): Promise<MultipartTarget>;
  /**
   * Assemble the parts into the object.
   *
   * Deliberately takes no ETags. S3 wants a part number and an ETag for each
   * part, and the obvious design has the browser read the ETag off every
   * response and post the list back — which needs `ETag` in the bucket's
   * CORS expose-headers, and trusts the tab to report honestly on ten
   * thousand requests. ListParts gives the server the same list from the
   * other end, so the browser only ever has to say "done".
   */
  completeMultipartUpload(input: {
    key: string;
    uploadId: string;
    expectedParts: number;
  }): Promise<void>;
  abortMultipartUpload(input: { key: string; uploadId: string }): Promise<void>;
  delete(key: string): Promise<void>;
  /** Everything in the bucket. Used to find uploads no post ever claimed. */
  list(): Promise<StoredObject[]>;
}

export class MediaStorageNotConfiguredError extends Error {
  constructor() {
    super(
      "Media storage is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, " +
        "R2_SECRET_ACCESS_KEY, R2_BUCKET, and R2_PUBLIC_BASE_URL. " +
        "See .env.example.",
    );
    this.name = "MediaStorageNotConfiguredError";
  }
}

// True when every R2 variable is present. The composer asks so it can offer a
// file picker or fall back to asking for a URL, rather than presenting a
// button that fails on click.
export function isMediaStorageConfigured(): boolean {
  return [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
    "R2_PUBLIC_BASE_URL",
  ].every((name) => Boolean(process.env[name]));
}

// R2's S3 endpoint. Region is literally "auto" — R2 has no regions in the S3
// sense, but SigV4 requires the field, and Cloudflare documents this value.
const R2_REGION = "auto";

export function createMediaStore(now: () => Date = () => new Date()): MediaStore {
  if (!isMediaStorageConfigured()) throw new MediaStorageNotConfiguredError();

  const accountId = requireEnv("R2_ACCOUNT_ID");
  const accessKeyId = requireEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = requireEnv("R2_SECRET_ACCESS_KEY");
  const bucket = requireEnv("R2_BUCKET");
  const publicBaseUrl = requireEnv("R2_PUBLIC_BASE_URL");
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;

  return {
    async createUploadTarget(input) {
      const key = buildObjectKey({
        userId: input.userId,
        workspaceId: input.workspaceId,
        extension: input.extension,
        random: randomBytes(16).toString("hex"),
      });

      const uploadUrl = presignUrl({
        method: "PUT",
        endpoint,
        key: `${bucket}/${key}`,
        accessKeyId,
        secretAccessKey,
        region: R2_REGION,
        expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
        now: now(),
        // Pinned into the signature: a browser that sends a different
        // content-type is refused by R2 rather than storing an object the
        // platforms will later fail to read.
        signedHeaders: { "content-type": input.contentType },
      });

      return {
        uploadUrl,
        headers: { "content-type": input.contentType },
        publicUrl: publicUrlFor(publicBaseUrl, key),
        key,
      };
    },

    async createMultipartTarget(input) {
      const key = buildObjectKey({
        userId: input.userId,
        workspaceId: input.workspaceId,
        extension: input.extension,
        random: randomBytes(16).toString("hex"),
      });
      const partBytes = partSizeFor(input.sizeBytes);
      const partCount = partCountFor(input.sizeBytes, partBytes);
      if (partCount > MAX_PARTS) {
        // partSizeFor exists to make this impossible; it is checked anyway
        // because signing 10,001 URLs would be a slow way to find out.
        throw new Error(
          `${input.sizeBytes} bytes needs ${partCount} parts; R2 allows ${MAX_PARTS}`,
        );
      }

      const createUrl = presignUrl({
        method: "POST",
        endpoint,
        key: `${bucket}/${key}`,
        accessKeyId,
        secretAccessKey,
        region: R2_REGION,
        expiresInSeconds: 300,
        now: now(),
        queryParams: { uploads: "" },
        signedHeaders: { "content-type": input.contentType },
      });
      const created = await fetch(createUrl, {
        method: "POST",
        headers: { "content-type": input.contentType },
        signal: AbortSignal.timeout(30_000),
      });
      const createdXml = await created.text();
      if (!created.ok) {
        throw new Error(
          `R2 multipart create failed: HTTP ${created.status} ${createdXml.slice(0, 200)}`,
        );
      }
      const uploadId = /<UploadId>([^<]+)<\/UploadId>/.exec(createdXml)?.[1];
      if (!uploadId) {
        throw new Error("R2 multipart create returned no UploadId");
      }

      // The signing clock is read once, so every part URL expires together.
      const signedAt = now();
      const partUrls = Array.from({ length: partCount }, (_, i) =>
        presignUrl({
          method: "PUT",
          endpoint,
          key: `${bucket}/${key}`,
          accessKeyId,
          secretAccessKey,
          region: R2_REGION,
          expiresInSeconds: MULTIPART_URL_TTL_SECONDS,
          now: signedAt,
          queryParams: {
            partNumber: String(i + 1),
            uploadId,
          },
          // No content-type pinned on a part: a part is a byte range, not a
          // file, and S3 ignores the header. Pinning it only creates a way
          // for the browser to get a 403 for saying something true.
        }),
      );

      return {
        key,
        uploadId,
        publicUrl: publicUrlFor(publicBaseUrl, key),
        partBytes,
        partUrls,
      };
    },

    async completeMultipartUpload({ key, uploadId, expectedParts }) {
      const parts: { partNumber: number; etag: string }[] = [];
      let marker: string | null = null;
      // ListParts pages at 1000, and there can be ten times that.
      for (let page = 0; page < 16; page += 1) {
        const url = presignUrl({
          method: "GET",
          endpoint,
          key: `${bucket}/${key}`,
          accessKeyId,
          secretAccessKey,
          region: R2_REGION,
          expiresInSeconds: 300,
          now: now(),
          queryParams: {
            uploadId,
            "max-parts": "1000",
            ...(marker ? { "part-number-marker": marker } : {}),
          },
        });
        const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
        const xml = await response.text();
        if (!response.ok) {
          throw new Error(
            `R2 list parts failed: HTTP ${response.status} ${xml.slice(0, 200)}`,
          );
        }
        for (const match of xml.matchAll(/<Part>([\s\S]*?)<\/Part>/g)) {
          const entry = match[1];
          const number = /<PartNumber>(\d+)<\/PartNumber>/.exec(entry)?.[1];
          const etag = /<ETag>([^<]+)<\/ETag>/.exec(entry)?.[1];
          if (!number || !etag) continue;
          // ListParts returns the ETag with its quotes as entities —
          // `&quot;abc&quot;` — and CompleteMultipartUpload wants the literal
          // value back. Sending the entities through untouched (and then
          // escaping the `&` a second time on the way out) is what R2 answers
          // with `InvalidPart: One or more of the specified parts could not be
          // found`, which reads like a missing part rather than a mangled one.
          parts.push({ partNumber: Number(number), etag: decodeXml(etag) });
        }
        const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
        marker = truncated
          ? (/<NextPartNumberMarker>([^<]+)<\/NextPartNumberMarker>/.exec(xml)?.[1] ??
            null)
          : null;
        if (!marker) break;
      }

      parts.sort((a, b) => a.partNumber - b.partNumber);
      // A short list means the browser stopped early or a part failed
      // silently. Completing anyway would produce a truncated video that
      // publishes and looks like a platform bug.
      if (parts.length !== expectedParts) {
        throw new Error(
          `R2 has ${parts.length} of ${expectedParts} parts for ${key}; refusing to assemble a partial file`,
        );
      }

      const body =
        "<CompleteMultipartUpload>" +
        parts
          .map(
            (part) =>
              `<Part><PartNumber>${part.partNumber}</PartNumber><ETag>${escapeXml(part.etag)}</ETag></Part>`,
          )
          .join("") +
        "</CompleteMultipartUpload>";

      const completeUrl = presignUrl({
        method: "POST",
        endpoint,
        key: `${bucket}/${key}`,
        accessKeyId,
        secretAccessKey,
        region: R2_REGION,
        expiresInSeconds: 300,
        now: now(),
        queryParams: { uploadId },
      });
      const response = await fetch(completeUrl, {
        method: "POST",
        body,
        signal: AbortSignal.timeout(120_000),
      });
      const text = await response.text();
      // S3 can answer 200 and then put the failure in the body — the
      // connection is held open while the parts are stitched, so the status
      // line is sent before the outcome is known.
      if (!response.ok || /<Error>/.test(text)) {
        throw new Error(
          `R2 multipart complete failed: HTTP ${response.status} ${text.slice(0, 200)}`,
        );
      }
    },

    async abortMultipartUpload({ key, uploadId }) {
      const url = presignUrl({
        method: "DELETE",
        endpoint,
        key: `${bucket}/${key}`,
        accessKeyId,
        secretAccessKey,
        region: R2_REGION,
        expiresInSeconds: 300,
        now: now(),
        queryParams: { uploadId },
      });
      const response = await fetch(url, {
        method: "DELETE",
        signal: AbortSignal.timeout(30_000),
      });
      // 404 means the upload is already gone, which is the state we wanted.
      if (!response.ok && response.status !== 404) {
        throw new Error(
          `R2 multipart abort failed for ${key}: HTTP ${response.status}`,
        );
      }
    },

    async list(): Promise<StoredObject[]> {
      // ListObjectsV2 against the bucket root. The bucket only ever holds
      // media awaiting publish, so with cleanup working it stays small; the
      // 1000-object page size is far beyond that, and a truncated response
      // simply means the next tick continues where this one stopped.
      const objects: StoredObject[] = [];
      const url = presignUrl({
        method: "GET",
        endpoint,
        key: bucket,
        accessKeyId,
        secretAccessKey,
        region: R2_REGION,
        expiresInSeconds: 300,
        now: now(),
        queryParams: { "list-type": "2" },
      });
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      const xml = await response.text();
      if (!response.ok) {
        throw new Error(`R2 list failed: HTTP ${response.status} ${xml.slice(0, 200)}`);
      }
      // Minimal parse rather than an XML dependency: three fields, one shape,
      // and a malformed entry is skipped rather than crashing the sweep.
      for (const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
        const entry = match[1];
        const key = /<Key>([^<]*)<\/Key>/.exec(entry)?.[1];
        const modified = /<LastModified>([^<]*)<\/LastModified>/.exec(entry)?.[1];
        const size = /<Size>(\d+)<\/Size>/.exec(entry)?.[1];
        if (!key || !modified) continue;
        const uploadedAt = new Date(modified);
        if (Number.isNaN(uploadedAt.getTime())) continue;
        objects.push({ key, uploadedAt, sizeBytes: Number(size ?? 0) });
      }
      return objects;
    },

    async delete(key: string) {
      const url = presignUrl({
        method: "DELETE",
        endpoint,
        key: `${bucket}/${key}`,
        accessKeyId,
        secretAccessKey,
        region: R2_REGION,
        expiresInSeconds: 300,
        now: now(),
      });
      const response = await fetch(url, {
        method: "DELETE",
        signal: AbortSignal.timeout(30_000),
      });
      // 404 means it is already gone, which is the state we wanted.
      if (!response.ok && response.status !== 404) {
        throw new Error(
          `R2 delete failed for ${key}: HTTP ${response.status} ${await response.text().catch(() => "")}`.slice(
            0,
            300,
          ),
        );
      }
    },
  };
}

// The MediaPurgeStore the scheduler's sweep runs against. Service-role client:
// storage cleanup is not a per-tenant concern, so it filters on post state
// rather than on a user.
export function createMediaPurgeStore(
  supabase: SupabaseClient,
  media: MediaStore = createMediaStore(),
): MediaPurgeStore {
  return {
    async listUnpurgedPosts(limit: number): Promise<PurgeablePost[]> {
      // Every unpurged post, not only the finished ones: a draft or scheduled
      // post's media must be protected from both sweeps, and the orphan pass
      // needs to know every key that is still spoken for.
      const { data, error } = await supabase
        .from("scheduled_posts")
        .select("id, status, media, published_at, updated_at")
        .is("media_purged_at", null)
        .order("created_at", { ascending: true })
        .limit(limit);
      if (error) throw error;

      return (data ?? []).map((row: Record<string, unknown>) => {
        const raw = (row as { media?: unknown }).media;
        const mediaUrls = Array.isArray(raw)
          ? raw
              .map((item) =>
                typeof item === "object" && item !== null
                  ? (item as Record<string, unknown>).url
                  : null,
              )
              .filter((url): url is string => typeof url === "string")
          : [];
        return {
          id: String(row.id),
          status: row.status as PurgeablePost["status"],
          mediaUrls,
          // published_at is only set when something went out; updated_at is
          // when the row last changed, which for a terminal post is when it
          // settled.
          settledAt:
            (row.published_at as string | null) ??
            (row.updated_at as string | null) ??
            null,
        };
      });
    },

    listObjects() {
      return media.list();
    },

    deleteObject(key: string) {
      return media.delete(key);
    },

    async markPurged(postId: string, at: Date) {
      const { error } = await supabase
        .from("scheduled_posts")
        .update({ media_purged_at: at.toISOString() })
        .eq("id", postId);
      if (error) throw error;
    },
  };
}
