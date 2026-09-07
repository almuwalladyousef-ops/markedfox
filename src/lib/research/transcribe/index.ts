import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getResearchProvider } from "../providers";
import { getSource, getTranscript, getVideo, saveTranscript } from "../store";

// The transcript layer. Deliberately NOT in actions.ts: that file is
// "use server", where every export becomes a server action and must be an
// async function taking serializable arguments — neither of which is true of a
// pure helper or of a function handed a Supabase client.

/**
 * The text a prompt may use.
 *
 * `captions` and `transcribed` are both real words from the video; `none` and
 * `failed` are not, and a caller must never accidentally treat the empty
 * string of a failure as "this video said nothing". One helper so the rule
 * lives in one place — it used to be an inline `origin === "captions"` check
 * repeated at three call sites, which is how a fourth would have got it wrong.
 */
export function usableTranscript(
  row: { text: string; origin: string } | null,
): string | null {
  if (!row) return null;
  if (row.origin !== "captions" && row.origin !== "transcribed") return null;
  return row.text.trim() ? row.text : null;
}

/**
 * Fetch and store a transcript. Free — no model runs on the caption path, and
 * the speech path is billed to us rather than to the user's credits.
 *
 * Returns whether there is now usable text, so a caller can decide what to do
 * next. A FAILURE IS NOT STORED: caching one is exactly how a dead YouTube
 * endpoint spent weeks pretending every video had no captions.
 */
export async function pullTranscript(
  supabase: SupabaseClient,
  userId: string,
  videoId: string,
): Promise<boolean> {
  const existing = await getTranscript(supabase, videoId);
  // 'none' is a real answer and is cached on purpose — re-asking a platform
  // that has already said no costs quota and changes nothing.
  if (existing) return usableTranscript(existing) !== null;

  const video = await getVideo(supabase, videoId);
  if (!video) return false;

  const source = await getSource(supabase, video.source_id);
  if (!source) return false;

  const provider = getResearchProvider(source.platform);
  if (!provider.capabilities.transcripts || !provider.fetchTranscript) {
    return false;
  }

  const result = await provider.fetchTranscript({
    externalId: video.external_id,
    url: video.url,
    mediaUrl: video.media_url,
  });

  if (result.origin === "failed") {
    // Ours to fix, not theirs to read. The reason goes to the server log and
    // nowhere near a screen.
    console.error(
      `[research] transcript failed for video ${videoId} (${source.platform}): ${result.reason ?? "no reason given"}`,
    );
    return false;
  }

  await saveTranscript(supabase, {
    videoId,
    userId,
    workspaceId: video.workspace_id,
    text: result.text,
    language: result.language,
    origin: result.origin,
  });

  return usableTranscript(result) !== null;
}

