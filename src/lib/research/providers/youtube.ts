// YouTube research provider — the richest of the four, and the only one that
// can read ANY public channel without the channel owner's permission.
//
// It reads with a plain API key (YOUTUBE_API_KEY), not OAuth: the Data API v3
// serves public channel and video statistics to any key holder. That is a
// different key from the GOOGLE_CLIENT_ID/SECRET the YouTube *publishing*
// adapter uses, and deliberately so — research works before the upload audit
// lands, which matters because the audit is the slow part.
//
// Quota: 10,000 units/day free. channels.list, playlistItems.list and
// videos.list are 1 unit each, search.list is 100 — which is why handle
// resolution goes through channels.list?forHandle and only falls back to
// search when a user pastes something we cannot parse.

import { requireEnv } from "@/lib/env";

import {
  ResearchProviderError,
  type ProviderContext,
  type ResearchProvider,
  type SourceIdentity,
  type SourceVideo,
  type TranscriptResult,
} from "../types";

const API = "https://www.googleapis.com/youtube/v3";
const TIMEOUT_MS = 15_000;

async function call<T>(
  path: string,
  params: Record<string, string>,
): Promise<T> {
  let key: string;
  try {
    key = requireEnv("YOUTUBE_API_KEY");
  } catch {
    throw new ResearchProviderError(
      "YouTube research needs YOUTUBE_API_KEY",
      "not_configured",
    );
  }

  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("key", key);

  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
  } catch (error) {
    throw new ResearchProviderError(
      `YouTube did not answer: ${(error as Error).message}`,
      "upstream",
    );
  }

  if (response.status === 403 || response.status === 429) {
    const body = await response.text();
    // Quota exhaustion and a bad key both arrive as 403; the reason string is
    // the only way to tell a user "try tomorrow" from "fix your key".
    const quota = body.includes("quotaExceeded") || body.includes("rateLimit");
    throw new ResearchProviderError(
      quota
        ? "YouTube's daily research quota is spent — it resets at midnight Pacific."
        : `YouTube refused the request: ${body.slice(0, 200)}`,
      quota ? "rate_limited" : "not_configured",
    );
  }
  if (!response.ok) {
    const body = await response.text();
    throw new ResearchProviderError(
      `YouTube returned ${response.status}: ${body.slice(0, 200)}`,
      "upstream",
    );
  }
  return (await response.json()) as T;
}

interface ChannelItem {
  id: string;
  snippet?: {
    title?: string;
    customUrl?: string;
    thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
  };
  statistics?: { subscriberCount?: string };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
}

/**
 * Turn whatever the user pasted into a channel. Accepts a channel id, a
 * @handle, a /channel/UC… URL, a /@handle URL, or a plain name (which costs a
 * 100-unit search, so it is the last resort).
 */
function parseChannelInput(raw: string): { kind: "id" | "handle" | "query"; value: string } {
  const input = raw.trim();

  const urlMatch = input.match(
    /youtube\.com\/(?:channel\/(UC[\w-]{20,})|(@[\w.-]+)|(?:c|user)\/([\w.-]+))/i,
  );
  if (urlMatch) {
    if (urlMatch[1]) return { kind: "id", value: urlMatch[1] };
    if (urlMatch[2]) return { kind: "handle", value: urlMatch[2] };
    if (urlMatch[3]) return { kind: "query", value: urlMatch[3] };
  }
  if (/^UC[\w-]{20,}$/.test(input)) return { kind: "id", value: input };
  if (input.startsWith("@")) return { kind: "handle", value: input };
  return { kind: "query", value: input };
}

function toIdentity(item: ChannelItem): SourceIdentity {
  const subs = item.statistics?.subscriberCount;
  return {
    platform: "youtube",
    externalId: item.id,
    handle: item.snippet?.customUrl ?? null,
    title: item.snippet?.title ?? item.id,
    thumbnailUrl:
      item.snippet?.thumbnails?.medium?.url ??
      item.snippet?.thumbnails?.default?.url ??
      null,
    followerCount: subs ? Number(subs) : null,
  };
}

const CHANNEL_PARTS = "snippet,statistics,contentDetails";

async function resolveSource(input: string): Promise<SourceIdentity> {
  const parsed = parseChannelInput(input);

  if (parsed.kind === "id" || parsed.kind === "handle") {
    const params: Record<string, string> = { part: CHANNEL_PARTS };
    if (parsed.kind === "id") params.id = parsed.value;
    else params.forHandle = parsed.value;

    const data = await call<{ items?: ChannelItem[] }>("channels", params);
    const item = data.items?.[0];
    if (item) return toIdentity(item);
    // A handle that resolves to nothing falls through to search rather than
    // failing: YouTube's forHandle is exact-match and misses legacy names.
  }

  const search = await call<{
    items?: { id?: { channelId?: string } }[];
  }>("search", {
    part: "snippet",
    type: "channel",
    maxResults: "1",
    q: parsed.value,
  });
  const channelId = search.items?.[0]?.id?.channelId;
  if (!channelId) {
    throw new ResearchProviderError(
      `No YouTube channel found for "${input}"`,
      "not_found",
    );
  }
  const data = await call<{ items?: ChannelItem[] }>("channels", {
    part: CHANNEL_PARTS,
    id: channelId,
  });
  const item = data.items?.[0];
  if (!item) {
    throw new ResearchProviderError(
      `No YouTube channel found for "${input}"`,
      "not_found",
    );
  }
  return toIdentity(item);
}

/**
 * Free-text channel search.
 *
 * search.list costs 100 quota units against a 10,000/day allowance, so this is
 * 1% of the day per search — fine for a person picking channels once, ruinous
 * if it were ever called on a page render. It is only reachable from an
 * explicit submit for exactly that reason.
 */
async function searchChannels(
  query: string,
  _ctx: ProviderContext,
  limit: number,
): Promise<SourceIdentity[]> {
  const search = await call<{
    items?: { id?: { channelId?: string } }[];
  }>("search", {
    part: "snippet",
    type: "channel",
    maxResults: String(Math.min(Math.max(limit, 1), 25)),
    q: query.slice(0, 100),
  });

  const ids = (search.items ?? [])
    .map((item) => item.id?.channelId)
    .filter((id): id is string => Boolean(id));
  if (ids.length === 0) return [];

  // One channels.list for all of them (1 unit) rather than one per result:
  // search.list's snippet has no subscriber count, and follower count is the
  // number that tells the user whether a channel is worth tracking.
  const data = await call<{ items?: ChannelItem[] }>("channels", {
    part: CHANNEL_PARTS,
    id: ids.join(","),
  });
  return (data.items ?? []).map(toIdentity);
}

/** ISO 8601 duration (PT4M13S) to seconds. */
export function parseIsoDuration(iso: string | undefined): number | null {
  if (!iso) return null;
  const m = iso.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  const [, d, h, min, s] = m;
  const seconds =
    Number(d ?? 0) * 86400 +
    Number(h ?? 0) * 3600 +
    Number(min ?? 0) * 60 +
    Number(s ?? 0);
  return Number.isFinite(seconds) ? seconds : null;
}

async function uploadsPlaylistId(channelId: string): Promise<string> {
  const data = await call<{ items?: ChannelItem[] }>("channels", {
    part: "contentDetails",
    id: channelId,
  });
  const playlist = data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!playlist) {
    throw new ResearchProviderError(
      "That channel has no public uploads playlist",
      "not_found",
    );
  }
  return playlist;
}

interface VideoItem {
  id: string;
  snippet?: {
    title?: string;
    description?: string;
    publishedAt?: string;
    thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
  };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  };
  contentDetails?: { duration?: string };
}

function num(value: string | undefined): number | null {
  if (value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function listVideos(
  source: SourceIdentity,
  _ctx: ProviderContext,
  limit: number,
): Promise<SourceVideo[]> {
  const playlistId = await uploadsPlaylistId(source.externalId);

  // Page the uploads playlist for ids (1 unit per 50), then hydrate stats in
  // batches of 50 (1 unit per batch). 50 videos costs 2 units total.
  const ids: string[] = [];
  let pageToken: string | undefined;
  while (ids.length < limit) {
    const page = await call<{
      items?: { contentDetails?: { videoId?: string } }[];
      nextPageToken?: string;
    }>("playlistItems", {
      part: "contentDetails",
      playlistId,
      maxResults: String(Math.min(50, limit - ids.length)),
      ...(pageToken ? { pageToken } : {}),
    });
    for (const item of page.items ?? []) {
      const id = item.contentDetails?.videoId;
      if (id) ids.push(id);
    }
    if (!page.nextPageToken || (page.items ?? []).length === 0) break;
    pageToken = page.nextPageToken;
  }

  const videos: SourceVideo[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const data = await call<{ items?: VideoItem[] }>("videos", {
      part: "snippet,statistics,contentDetails",
      id: batch.join(","),
    });
    for (const item of data.items ?? []) {
      videos.push({
        externalId: item.id,
        title: item.snippet?.title ?? item.id,
        description: item.snippet?.description ?? null,
        url: `https://www.youtube.com/watch?v=${item.id}`,
        thumbnailUrl:
          item.snippet?.thumbnails?.medium?.url ??
          item.snippet?.thumbnails?.default?.url ??
          null,
        publishedAt: item.snippet?.publishedAt ?? null,
        durationSeconds: parseIsoDuration(item.contentDetails?.duration),
        viewCount: num(item.statistics?.viewCount),
        likeCount: num(item.statistics?.likeCount),
        commentCount: num(item.statistics?.commentCount),
      });
    }
  }
  return videos;
}

// Transcripts. YouTube's official captions.download endpoint only serves the
// video OWNER's OAuth token, which is exactly the case research does not have —
// we are reading other people's channels. The public timedtext endpoint is what
// remains; it is undocumented and frequently serves nothing. So this returns
// origin 'unavailable' rather than throwing, and the caller records that fact
// so the UI stops offering a button that cannot work for this video.
async function fetchTranscript(video: {
  externalId: string;
}): Promise<TranscriptResult> {
  const url = new URL("https://www.youtube.com/api/timedtext");
  url.searchParams.set("v", video.externalId);
  url.searchParams.set("lang", "en");
  url.searchParams.set("fmt", "json3");

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return unavailable();
    const body = await response.text();
    if (!body.trim()) return unavailable();

    const parsed = JSON.parse(body) as {
      events?: { segs?: { utf8?: string }[] }[];
    };
    const text = (parsed.events ?? [])
      .flatMap((event) => event.segs ?? [])
      .map((seg) => seg.utf8 ?? "")
      .join("")
      .replace(/\n+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();

    if (!text) return unavailable();
    return { text, language: "en", origin: "captions" };
  } catch {
    return unavailable();
  }
}

function unavailable(): TranscriptResult {
  return { text: "", language: null, origin: "unavailable" };
}

export const youtubeResearch: ResearchProvider = {
  platform: "youtube",
  label: "YouTube",
  capabilities: {
    discoverAnyChannel: true,
    searchChannels: true,
    requiresConnection: false,
    ownContentOnly: false,
    meteredReads: false,
    transcripts: true,
  },
  requiredEnv: ["YOUTUBE_API_KEY"],
  resolveSource,
  searchChannels,
  listVideos,
  fetchTranscript,
};
