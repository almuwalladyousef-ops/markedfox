import type { MediaRef } from "@/lib/platforms/types";

import {
  SINGLE_PUT_MAX_BYTES,
  type UploadContext,
  type UploadIntent,
} from "./policy";

// Getting one file into R2 from the browser, by whichever of the two paths
// fits it. The bytes never pass through our box on either — on a 1 vCPU / 2GB
// droplet that is the difference between one person uploading a video and
// every other request stalling behind it.
//
// Below SINGLE_PUT_MAX_BYTES it is one signed PUT, unchanged since the media
// path was built. Above it R2 refuses a single request outright, so the file
// is cut into parts, each with its own signed URL, and the server stitches
// them together at the end.

export type UploadedMedia = Required<Pick<MediaRef, "url" | "type" | "bytes">>;

export type UploadInput = {
  file: File;
  workspaceId: string;
  /** "short" or "long" — what the composer said this post is. */
  context: UploadContext;
  /** "now" or "schedule". A file being parked until later is judged more
   *  strictly, and the refusal has to arrive before the upload, not after. */
  intent: UploadIntent;
  onProgress: (percent: number) => void;
};

async function postJson(
  url: string,
  body: unknown,
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    throw new Error(
      String(parsed.message ?? `That file was refused (HTTP ${response.status}).`),
    );
  }
  return parsed;
}

/** One PUT, with progress. XMLHttpRequest rather than fetch purely because it
 *  reports upload progress, which fetch still does not. */
function put(
  url: string,
  body: Blob,
  headers: Record<string, string>,
  onProgress: (loaded: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [name, value] of Object.entries(headers)) {
      xhr.setRequestHeader(name, value);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (HTTP ${xhr.status}).`));
    xhr.onerror = () =>
      reject(new Error("Upload failed — check your connection."));
    xhr.send(body);
  });
}

export async function uploadFile(input: UploadInput): Promise<UploadedMedia> {
  const { file, workspaceId, context, intent, onProgress } = input;
  const contentType = file.type;
  const common = {
    workspaceId,
    contentType,
    sizeBytes: file.size,
    context,
    intent,
  };

  if (file.size <= SINGLE_PUT_MAX_BYTES) {
    const target = (await postJson("/api/media/upload-url", common)) as {
      uploadUrl: string;
      publicUrl: string;
      headers: Record<string, string>;
      kind: MediaRef["type"];
    };
    onProgress(0);
    await put(target.uploadUrl, file, target.headers, (loaded) =>
      onProgress(Math.round((loaded / file.size) * 100)),
    );
    return { url: target.publicUrl, type: target.kind, bytes: file.size };
  }

  const target = (await postJson("/api/media/multipart", common)) as {
    key: string;
    uploadId: string;
    publicUrl: string;
    partBytes: number;
    partUrls: string[];
    kind: MediaRef["type"];
  };

  // Only one part is ever held by the tab: `File.slice` is a view, and the
  // bytes are read as the request streams. A 200GB file does not become
  // 200GB of memory.
  let done = 0;
  try {
    for (let i = 0; i < target.partUrls.length; i += 1) {
      const start = i * target.partBytes;
      const end = Math.min(start + target.partBytes, file.size);
      const chunk = file.slice(start, end);
      // No content-type on a part: a part is a byte range, not a file, and
      // pinning the header only creates a way to be refused for telling the
      // truth.
      await put(target.partUrls[i], chunk, {}, (loaded) =>
        onProgress(Math.min(99, Math.round(((done + loaded) / file.size) * 100))),
      );
      done += end - start;
      onProgress(Math.min(99, Math.round((done / file.size) * 100)));
    }
  } catch (error) {
    // Parts already in R2 are billed until something removes them, and
    // nothing sweeps an unfinished multipart upload — the orphan pass lists
    // finished objects, and this is not one yet.
    await postJson("/api/media/multipart/abort", {
      workspaceId,
      key: target.key,
      uploadId: target.uploadId,
    }).catch(() => {});
    throw error;
  }

  // The last 1% is the stitch, which for a very large file is not instant.
  await postJson("/api/media/multipart/complete", {
    workspaceId,
    key: target.key,
    uploadId: target.uploadId,
    expectedParts: target.partUrls.length,
  });
  onProgress(100);

  return { url: target.publicUrl, type: target.kind, bytes: file.size };
}
