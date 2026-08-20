// X research provider.
//
// X's v2 API can read any public account's recent posts with their public
// metrics, which is exactly what research needs — but reads are metered on the
// pay-per-use plan the product is on, so every sync spends real money. That is
// why capabilities.meteredReads is true and the UI warns before a sync, and why
// the sync window here is deliberately smaller than YouTube's.
//
// Reads use app-only auth (the bearer token), not a connected user's token: a
// public timeline needs no user context, and going app-only means research
// works without the user having connected their own X account.

import { requireEnv } from "@/lib/env";

import {
  ResearchProviderError,
  type ProviderContext,
  type ResearchProvider,
  type SourceIdentity,
  type SourceVideo,
} from "../types";

const API = "https://api.x.com/2";
const TIMEOUT_MS = 15_000;

/** Reads cost money, so the window is tight on purpose. */
export const X_SYNC_LIMIT = 25;

async function call<T>(path: string, params: Record<string, string>): Promise<T> {
  let bearer: string;
  try {
    bearer = requireEnv("X_BEARER_TOKEN");
  } catch {
    throw new ResearchProviderError(
      "X research needs X_BEARER_TOKEN",
      "not_configured",
    );
  }

  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { authorization: `Bearer ${bearer}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new ResearchProviderError(
      `X did not answer: ${(error as Error).message}`,
      "upstream",
    );
  }

  const body = await response.text();
  if (response.status === 429) {
    throw new ResearchProviderError(
      "X is rate-limiting research reads — try again in a few minutes.",
      "rate_limited",
    );
  }
  if (response.status === 401 || response.status === 403) {
    throw new ResearchProviderError(
      `X refused the bearer token: ${body.slice(0, 200)}`,
      "not_configured",
    );
  }
  if (!response.ok) {
    throw new ResearchProviderError(
      `X returned ${response.status}: ${body.slice(0, 200)}`,
      "upstream",
    );
  }
  return JSON.parse(body) as T;
}

/** @handle, a post/profile URL, or a bare username down to a username. */
export function parseXInput(raw: string): string {
  const input = raw.trim();
  const url = input.match(/(?:twitter|x)\.com\/([A-Za-z0-9_]{1,15})/i);
  if (url) return url[1];
  return input.replace(/^@/, "").replace(/\/+$/, "");
}

interface XUser {
  id: string;
  name?: string;
  username?: string;
  profile_image_url?: string;
  public_metrics?: { followers_count?: number };
}

async function resolveSource(input: string): Promise<SourceIdentity> {
  const username = parseXInput(input);
  if (!username) {
    throw new ResearchProviderError("Enter an X username", "not_found");
  }

  const data = await call<{ data?: XUser; errors?: unknown[] }>(
    `users/by/username/${encodeURIComponent(username)}`,
    { "user.fields": "profile_image_url,public_metrics,name,username" },
  );
  const user = data.data;
  if (!user?.id) {
    throw new ResearchProviderError(`No X account called @${username}`, "not_found");
  }
  return {
    platform: "x",
    externalId: user.id,
    handle: user.username ? `@${user.username}` : `@${username}`,
    title: user.name || user.username || username,
    thumbnailUrl: user.profile_image_url ?? null,
    followerCount: user.public_metrics?.followers_count ?? null,
  };
}

interface XPost {
  id: string;
  text?: string;
  created_at?: string;
  public_metrics?: {
    impression_count?: number;
    like_count?: number;
    reply_count?: number;
    retweet_count?: number;
  };
}

async function listVideos(
  source: SourceIdentity,
  _ctx: ProviderContext,
  limit: number,
): Promise<SourceVideo[]> {
  const data = await call<{ data?: XPost[] }>(
    `users/${encodeURIComponent(source.externalId)}/tweets`,
    {
      max_results: String(Math.min(Math.max(limit, 5), 100)),
      "tweet.fields": "created_at,public_metrics,text",
      exclude: "retweets,replies",
    },
  );

  const handle = (source.handle ?? "").replace(/^@/, "");
  return (data.data ?? []).map((post) => {
    const text = (post.text ?? "").trim();
    const metrics = post.public_metrics ?? {};
    return {
      externalId: post.id,
      title: text.split("\n")[0]?.slice(0, 120) || "(no text)",
      description: text || null,
      url: `https://x.com/${handle || "i"}/status/${post.id}`,
      thumbnailUrl: null,
      publishedAt: post.created_at ?? null,
      durationSeconds: null,
      // impression_count is only present for posts the token's own app can see
      // impressions for; likes are the reliable public signal, so they carry
      // the baseline when impressions are absent.
      viewCount: metrics.impression_count ?? metrics.like_count ?? null,
      likeCount: metrics.like_count ?? null,
      commentCount: metrics.reply_count ?? null,
    };
  });
}

export const xResearch: ResearchProvider = {
  platform: "x",
  label: "X",
  capabilities: {
    discoverAnyChannel: true,
    requiresConnection: false,
    ownContentOnly: false,
    meteredReads: true,
    transcripts: false,
  },
  requiredEnv: ["X_BEARER_TOKEN"],
  resolveSource,
  listVideos,
};
