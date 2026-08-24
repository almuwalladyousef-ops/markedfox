import {
  buildFfmpegArgs,
  hasEdits,
  outputNameFor,
  type MediaEdit,
} from "./edit";

// The browser side of trimming and volume: loading ffmpeg, running it, handing
// back a new File. Everything about *what* to run lives in ./edit.ts, which is
// pure and tested; this file is the part that cannot be.
//
// Three things worth knowing before changing anything here:
//
// - **It is loaded on demand, never at import.** The core is ~32MB of
//   WebAssembly. Nobody who is posting an untouched clip should download it,
//   so the import is dynamic and only happens when an edit actually needs
//   applying.
// - **Single-threaded on purpose.** The multi-threaded core needs
//   SharedArrayBuffer, which needs COOP and COEP headers on every response,
//   which breaks every cross-origin image the app shows — R2 media, platform
//   avatars, thumbnails. A slower encode is a much smaller price than that,
//   and the work here is a remux rather than a transcode anyway.
// - **The instance is kept.** Loading takes seconds; a person trimming three
//   clips in one post should pay that once.

type FFmpegInstance = {
  loaded: boolean;
  load: (config?: { coreURL?: string; wasmURL?: string }) => Promise<void>;
  writeFile: (path: string, data: Uint8Array) => Promise<boolean>;
  readFile: (path: string) => Promise<Uint8Array | string>;
  deleteFile: (path: string) => Promise<boolean>;
  exec: (args: string[]) => Promise<number>;
  on: (event: string, handler: (payload: { progress: number }) => void) => void;
  off: (event: string, handler: (payload: { progress: number }) => void) => void;
};

let instance: Promise<FFmpegInstance> | null = null;

async function getFFmpeg(): Promise<FFmpegInstance> {
  if (!instance) {
    instance = (async () => {
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const ffmpeg = new FFmpeg() as unknown as FFmpegInstance;
      // Served from our own origin by scripts/copy-ffmpeg.mjs. The worker
      // pulls the core in with importScripts, which a cross-origin URL would
      // refuse without CORS — and a CDN would put a third-party request in the
      // middle of somebody publishing.
      await ffmpeg.load({
        coreURL: "/ffmpeg/ffmpeg-core.js",
        wasmURL: "/ffmpeg/ffmpeg-core.wasm",
      });
      return ffmpeg;
    })().catch((error) => {
      // A failed load must not poison every later attempt.
      instance = null;
      throw error;
    });
  }
  return instance;
}

export class MediaEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaEditError";
  }
}

/**
 * Apply a trim and a volume change, returning a new File.
 *
 * Returns the original file untouched when the edit amounts to nothing, which
 * is the common case and must stay free.
 */
export async function applyMediaEdits(
  file: File,
  edit: MediaEdit,
  durationSec: number,
  onProgress?: (percent: number) => void,
): Promise<File> {
  if (!hasEdits(edit, durationSec)) return file;

  let ffmpeg: FFmpegInstance;
  try {
    ffmpeg = await getFFmpeg();
  } catch (error) {
    throw new MediaEditError(
      `The video editor could not load, so the trim was not applied. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const input = `in-${Date.now()}.${file.name.split(".").pop() ?? "mp4"}`;
  const output = outputNameFor(file.name);
  const handler = ({ progress }: { progress: number }) => {
    onProgress?.(Math.min(100, Math.max(0, Math.round(progress * 100))));
  };

  try {
    ffmpeg.on("progress", handler);
    await ffmpeg.writeFile(
      input,
      new Uint8Array(await file.arrayBuffer()),
    );

    const code = await ffmpeg.exec(
      buildFfmpegArgs(edit, input, output, durationSec),
    );
    if (code !== 0) {
      throw new MediaEditError(
        `The trim did not complete (ffmpeg exited ${code}). The clip was not changed.`,
      );
    }

    const data = await ffmpeg.readFile(output);
    if (typeof data === "string" || data.length === 0) {
      throw new MediaEditError("The trim produced an empty file.");
    }

    return new File([data as BlobPart], output, { type: "video/mp4" });
  } finally {
    ffmpeg.off("progress", handler);
    // Best effort: the virtual filesystem persists between runs, and a 300MB
    // input left behind is 300MB of the tab's memory.
    await ffmpeg.deleteFile(input).catch(() => {});
    await ffmpeg.deleteFile(output).catch(() => {});
  }
}
