// TikTok research provider — your own account only, and that is not a bug.
//
// TikTok has two APIs that could serve research and neither serves competitor
// analysis to a commercial product:
//
//   * The Research API is restricted to accredited academic researchers at
//     non-profit institutions. A SaaS cannot get it. (Verified on TikTok's
//     developer portal; re-check before promising otherwise.)
//   * The Display API's video.list scope returns the CONNECTED user's own
//     videos with view, like, comment and share counts — nothing about anyone
//     else.
//
// So this provider does the honest thing: it reads the user's own TikTok and
// scores their videos against their own baseline, which is genuinely useful
// ("which of my videos beat my average, and what did they have in common") and
// is all the platform permits. Trying to add a competitor raises
// not_supported with that explanation rather than failing vaguely.

import {
  ResearchProviderError,
  type ProviderContext,
  type ResearchProvider,
  type SourceIdentity,
  type SourceVideo,
} from "../types";

const API = "https://open.tiktokapis.com/v2";
const TIMEOUT_MS = 20_000;

const VIDEO_FIELDS = [
  "id",
  "title",
  "video_description",
  "duration",
  "cover_image_url",
  "share_url",
  "create_time",
  "view_count",
  "like_count",
  "comment_count",
  "share_count",
].join(",");

function requireToken(ctx: ProviderContext): string {
  if (!ctx.accessToken) {
    throw new ResearchProviderError(
      "TikTok research reads your own connected TikTok account — connect one first.",
      "needs_connection",
    );
  }
  return ctx.accessToken;
}

async function call<T>(
  path: string,
  token: string,
  init: { params?: Record<string, string>; body?: unknown },
): Promise<T> {
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(init.params ?? {})) {
    url.searchParams.set(k, v);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: init.body ? "POST" : "GET",
      headers: {
        authorization: `Bearer ${token}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new ResearchProviderError(
      `TikTok did not answer: ${(error as Error).message}`,
      "upstream",
    );
  }

  const text = await response.text();
  if (response.status === 401 || response.status === 403) {
    throw new ResearchProviderError(
      "TikTok rejected the connection — reconnect the account.",
      "needs_connection",
    );
  }
  if (response.status === 429) {
    throw new ResearchProviderError(
      "TikTok is rate-limiting research reads — try again shortly.",
      "rate_limited",
    );
  }
  if (!response.ok) {
    throw new ResearchProviderError(
      `TikTok returned ${response.status}: ${text.slice(0, 200)}`,
      "upstream",
    );
  }
  return JSON.parse(text) as T;
}

interface CreatorInfo {
  data?: {
    creator_username?: string;
    creator_nickname?: string;
    creator_avatar_url?: string;
  };
}

async function resolveSource(
  input: string,
  ctx: ProviderContext,
): Promise<SourceIdentity> {
  const token = requireToken(ctx);

  // Anything that names somebody else is refused with the reason, because
  // TikTok genuinely cannot serve it — not because we did not implement it.
  const wanted = input.trim().replace(/^@/, "").toLowerCase();

  const info = await call<CreatorInfo>("post/publish/creator_info/query/", token, {
    body: {},
  });
  const username = info.data?.creator_username ?? "";

  if (wanted && wanted !== username.toLowerCase() && !/^me$|^self$/.test(wanted)) {
    throw new ResearchProviderError(
      "TikTok only lets apps read the connected account's own videos — its Research API is limited to academic institutions. You can track your own TikTok here; use YouTube or Instagram to research other creators.",
      "not_supported",
    );
  }

  if (!ctx.platformAccountId && !username) {
    throw new ResearchProviderError(
      "TikTok did not identify the connected account",
      "upstream",
    );
  }

  return {
    platform: "tiktok",
    externalId: ctx.platformAccountId ?? username,
    handle: username ? `@${username}` : null,
    title: info.data?.creator_nickname || username || "My TikTok",
    thumbnailUrl: info.data?.creator_avatar_url ?? null,
    followerCount: null,
  };
}

interface VideoNode {
  id: string;
  title?: string;
  video_description?: string;
  duration?: number;
  cover_image_url?: string;
  share_url?: string;
  create_time?: number;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
}

async function listVideos(
  _source: SourceIdentity,
  ctx: ProviderContext,
  limit: number,
): Promise<SourceVideo[]> {
  const token = requireToken(ctx);

  const videos: SourceVideo[] = [];
  let cursor: number | undefined;
  let hasMore = true;

  while (hasMore && videos.length < limit) {
    const page = await call<{
      data?: { videos?: VideoNode[]; cursor?: number; has_more?: boolean };
    }>("video/list/", token, {
      params: { fields: VIDEO_FIELDS },
      body: {
        max_count: Math.min(20, limit - videos.length),
        ...(cursor ? { cursor } : {}),
      },
    });

    for (const node of page.data?.videos ?? []) {
      const description = (node.video_description ?? "").trim();
      videos.push({
        externalId: node.id,
        title:
          node.title?.trim() ||
          description.split("\n")[0]?.slice(0, 120) ||
          "(untitled)",
        description: description || null,
        url: node.share_url ?? `https://www.tiktok.com/video/${node.id}`,
        thumbnailUrl: node.cover_image_url ?? null,
        // create_time is Unix seconds.
        publishedAt: node.create_time
          ? new Date(node.create_time * 1000).toISOString()
          : null,
        durationSeconds: node.duration ?? null,
        viewCount: node.view_count ?? null,
        likeCount: node.like_count ?? null,
        commentCount: node.comment_count ?? null,
      });
    }

    hasMore = Boolean(page.data?.has_more);
    cursor = page.data?.cursor;
    if (!cursor) break;
  }

  return videos;
}

export const tiktokResearch: ResearchProvider = {
  platform: "tiktok",
  label: "TikTok",
  capabilities: {
    discoverAnyChannel: false,
    requiresConnection: true,
    ownContentOnly: true,
    meteredReads: false,
    transcripts: false,
  },
  requiredEnv: [],
  resolveSource,
  listVideos,
};
