// Pulling a YouTube transcript, and why it takes a detour.
//
// The obvious call is `https://www.youtube.com/api/timedtext?v=<id>&lang=en`.
// That is what this app shipped with, and it has not worked for some time: the
// endpoint now answers **HTTP 200 with a zero-byte body** for every video,
// signed in or not. A 200 with no content reads as "this video has no
// captions", so the failure was invisible — every breakdown quietly fell back
// to working from the title alone, and every generated script was therefore
// invented rather than derived from what was actually said. One dead URL was
// the whole of the research pillar's quality problem.
//
// A caption track is still reachable, but only through a *signed* `baseUrl`
// that YouTube's own players are handed. So we ask for one the way a player
// does: POST to the InnerTube `player` endpoint, read the caption track list
// off the response, and fetch the URL it gives us.
//
// Measured 2026-09-07 across three known-good videos, all three InnerTube
// clients:
//
//   IOS      6/2/6 tracks   427 / 34 / 564 words   <- the only one that works
//   ANDROID  6/2/6 tracks   0 words (serves XML, ignores fmt=json3)
//   WEB      0 tracks       playabilityStatus UNPLAYABLE
//
// So the client identity is load-bearing, not incidental. Do not "tidy" it to
// ANDROID or WEB.
//
// This is an unofficial endpoint and it will break eventually. It lives in its
// own module for exactly that reason: when it goes, one file changes and the
// provider that calls it does not.

import type { TranscriptResult } from "../types";

const PLAYER_URL = "https://www.youtube.com/youtubei/v1/player";
const TIMEOUT_MS = 20_000;

/** The public InnerTube key. Not a secret and not ours — it is the same string
 *  every YouTube client ships with, and it identifies the API rather than the
 *  caller. Deliberately not an env var: it is not configuration, and putting it
 *  in one would imply an operator could or should change it. */
const INNERTUBE_KEY = "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w";

const IOS_CLIENT = {
  clientName: "IOS",
  clientVersion: "20.10.4",
  deviceModel: "iPhone16,2",
  hl: "en",
} as const;

export interface CaptionTrack {
  baseUrl: string;
  languageCode?: string;
  /** "asr" for machine-generated. Absent on a human-written track. */
  kind?: string;
}

/**
 * Pick the track to read.
 *
 * English first, because every prompt downstream is written in English and a
 * breakdown of a Spanish transcript would be a breakdown of a translation.
 * Within a language, a human-written track beats `asr`: automatic captions
 * mis-hear proper nouns, and the hook is quoted VERBATIM into the breakdown, so
 * a mis-heard opening line becomes a wrong answer stated confidently.
 *
 * Falls back to whatever exists rather than returning nothing — a transcript in
 * the wrong language still beats the title alone.
 */
export function pickCaptionTrack(
  tracks: readonly CaptionTrack[],
): CaptionTrack | null {
  if (tracks.length === 0) return null;
  const score = (track: CaptionTrack): number => {
    const english = track.languageCode?.toLowerCase().startsWith("en") ?? false;
    const manual = track.kind !== "asr";
    // English outranks manual: a hand-written Japanese track is less use here
    // than English auto-captions.
    return (english ? 2 : 0) + (manual ? 1 : 0);
  };
  return [...tracks].sort((a, b) => score(b) - score(a))[0] ?? null;
}

/** json3 is a list of events, each a list of segments. Joining the segments is
 *  the whole parse — the timing is deliberately dropped, because everything
 *  downstream reads the transcript as prose. */
export function parseJson3(body: string): string {
  let parsed: { events?: { segs?: { utf8?: string }[] }[] };
  try {
    parsed = JSON.parse(body) as typeof parsed;
  } catch {
    return "";
  }
  return (parsed.events ?? [])
    .flatMap((event) => event.segs ?? [])
    .map((seg) => seg.utf8 ?? "")
    .join("")
    .replace(/\n+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function fetchPlayerCaptionTracks(
  videoId: string,
): Promise<CaptionTrack[]> {
  const response = await fetch(`${PLAYER_URL}?key=${INNERTUBE_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ context: { client: IOS_CLIENT }, videoId }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) return [];

  const data = (await response.json()) as {
    captions?: {
      playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] };
    };
  };
  return data.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
}

/**
 * The provider's entry point. Distinguishes "this video has no captions" from
 * "we could not reach YouTube" — see `TranscriptResult.origin`. The old code
 * collapsed both into one silent answer, which is how a dead endpoint went
 * unnoticed for weeks.
 */
export async function fetchYouTubeTranscript(
  videoId: string,
): Promise<TranscriptResult> {
  let tracks: CaptionTrack[];
  try {
    tracks = await fetchPlayerCaptionTracks(videoId);
  } catch (error) {
    return {
      text: "",
      language: null,
      origin: "failed",
      reason: `YouTube player lookup failed: ${(error as Error).message}`,
    };
  }

  const track = pickCaptionTrack(tracks);
  if (!track) {
    return { text: "", language: null, origin: "none" };
  }

  let body: string;
  try {
    const response = await fetch(`${track.baseUrl}&fmt=json3`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      return {
        text: "",
        language: null,
        origin: "failed",
        reason: `Caption track returned HTTP ${response.status}`,
      };
    }
    body = await response.text();
  } catch (error) {
    return {
      text: "",
      language: null,
      origin: "failed",
      reason: `Caption fetch failed: ${(error as Error).message}`,
    };
  }

  const text = parseJson3(body);
  if (!text) {
    // A listed track that serves nothing is the exact shape of the bug this
    // module replaces, so it is reported as a failure rather than as an
    // absence. If YouTube breaks this path again, it says so.
    return {
      text: "",
      language: null,
      origin: "failed",
      reason: "Caption track was listed but served no text",
    };
  }

  return {
    text,
    language: track.languageCode ?? null,
    origin: "captions",
  };
}
