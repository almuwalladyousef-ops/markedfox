// Transcribing a video we can only reach as a file, by listening to it.
//
// YouTube serves captions (see ./youtube-captions.ts). Nothing else does.
// Instagram hands back a `media_url` on the business-discovery media edge, and
// that is a real MP4 — so for Instagram the transcript is not fetched, it is
// produced: download the file and run it through a speech model.
//
// Groq's Whisper endpoint is the model, chosen because the account already
// exists for text generation and the audio endpoint is the same key. Note that
// `configuredModel()` in ../generate.ts prefers Gemini when both keys are set,
// so adding GROQ_API_KEY for this does NOT change which model writes text.
//
// TikTok and X are absent on purpose. Neither exposes a direct media URL on
// the calls this app makes — TikTok's `video.list` gives a share page, X gives
// a status URL — so there is no file to listen to, and the UI says so rather
// than offering a button that always fails.

import { requireEnv } from "@/lib/env";
import { fetchMedia, UnsafeMediaUrlError } from "@/lib/media/fetch-guard";

import type { TranscriptResult } from "../types";

const ENDPOINT = "https://api.groq.com/openai/v1/audio/transcriptions";
const MODEL = "whisper-large-v3-turbo";
const TIMEOUT_MS = 120_000;

/** Groq refuses uploads above 25MB on the free tier, so anything larger cannot
 *  be transcribed however we hold it. Enforced on the way IN as well, which is
 *  what keeps a 1 vCPU / 2GB droplet safe: the download stops at the cap rather
 *  than reading a 2GB file to find out it was too big. */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/**
 * Read the body, refusing past the cap.
 *
 * Buffered rather than written to a temp file, and deliberately: the cap makes
 * the memory bound 25MB by construction, while a temp file is a thing that can
 * be left behind when a request is cancelled. The check is on BYTES READ, not
 * on `content-length` — a wrong or absent length header is exactly the case
 * that would defeat a header-only check.
 */
async function readCapped(
  response: Response,
  cap: number,
): Promise<Uint8Array | null> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > cap) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }

  const reader = response.body?.getReader();
  if (!reader) return null;

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * Download a media file and transcribe it.
 *
 * Every failure path returns `origin: "failed"` with a reason for the log,
 * never `"none"` — an outage on our side must not be cached as "this video has
 * no words in it", which is the mistake that made the YouTube caption bug
 * invisible.
 */
export async function transcribeFromMediaUrl(
  mediaUrl: string,
): Promise<TranscriptResult> {
  let key: string;
  try {
    key = requireEnv("GROQ_API_KEY");
  } catch {
    return {
      text: "",
      language: null,
      origin: "failed",
      reason: "GROQ_API_KEY is not set on this deployment",
    };
  }

  let bytes: Uint8Array | null;
  try {
    // Through the shared SSRF guard, because this is a server-side fetch of a
    // URL that ultimately came from a platform API response.
    const response = await fetchMedia(mediaUrl, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      return {
        text: "",
        language: null,
        origin: "failed",
        reason: `Media download returned HTTP ${response.status}`,
      };
    }
    bytes = await readCapped(response, MAX_AUDIO_BYTES);
  } catch (error) {
    const reason =
      error instanceof UnsafeMediaUrlError
        ? error.message
        : `Media download failed: ${(error as Error).message}`;
    return { text: "", language: null, origin: "failed", reason };
  }

  if (!bytes) {
    return {
      text: "",
      language: null,
      origin: "failed",
      reason: `Media is larger than the ${MAX_AUDIO_BYTES} byte transcription limit`,
    };
  }

  const form = new FormData();
  // Whisper reads the container, but the endpoint validates the extension, so
  // the name is not cosmetic.
  form.append("file", new Blob([bytes as BlobPart]), "audio.mp4");
  form.append("model", MODEL);
  form.append("response_format", "json");

  let data: { text?: string; error?: { message?: string } };
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    data = (await response.json()) as typeof data;
    if (!response.ok) {
      return {
        text: "",
        language: null,
        origin: "failed",
        reason: `Transcription refused: ${data.error?.message ?? response.status}`,
      };
    }
  } catch (error) {
    return {
      text: "",
      language: null,
      origin: "failed",
      reason: `Transcription failed: ${(error as Error).message}`,
    };
  }

  const text = (data.text ?? "").replace(/\s{2,}/g, " ").trim();
  // A silent video is a real answer, not a fault: nothing was said, and no
  // amount of retrying will change that.
  if (!text) return { text: "", language: null, origin: "none" };

  return { text, language: null, origin: "transcribed" };
}
