// Instagram research provider — business discovery.
//
// Meta lets a connected Instagram Business account look up ANY OTHER public
// business or creator account and read its recent media with like and comment
// counts. That is a real competitive-research surface and it works in
// Development mode, so the owner can use it before App Review lands.
//
// Two honest limits, both surfaced rather than hidden:
//   * It reads through a connected account's token, so research stops working
//     for a workspace with no Instagram connected.
//   * Business discovery does NOT return view/play counts, and personal
//     accounts are invisible to it entirely. So the baseline here is built from
//     LIKES, not views — which is why SourceVideo.viewCount carries likes for
//     this platform and the UI says "likes" wherever it says "views" elsewhere.

import {
  ResearchProviderError,
  type ProviderContext,
  type ResearchProvider,
  type SourceIdentity,
  type SourceVideo,
} from "../types";

const GRAPH = "https://graph.facebook.com/v26.0";
const TIMEOUT_MS = 15_000;

function requireContext(ctx: ProviderContext): {
  token: string;
  accountId: string;
} {
  if (!ctx.accessToken || !ctx.platformAccountId) {
    throw new ResearchProviderError(
      "Instagram research reads through one of your connected Instagram accounts — connect one first.",
      "needs_connection",
    );
  }
  return { token: ctx.accessToken, accountId: ctx.platformAccountId };
}

async function call<T>(url: URL): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    throw new ResearchProviderError(
      `Instagram did not answer: ${(error as Error).message}`,
      "upstream",
    );
  }
  const body = await response.text();
  if (!response.ok) {
    // Meta answers "account not found or not a business account" as a 400 with
    // a message, not a 404, so the text is the only signal.
    if (/does not exist|cannot be found|not found/i.test(body)) {
      throw new ResearchProviderError(
        "No public Instagram business or creator account with that username. Personal accounts cannot be researched.",
        "not_found",
      );
    }
    if (response.status === 429 || /rate limit/i.test(body)) {
      throw new ResearchProviderError(
        "Instagram is rate-limiting research requests — try again shortly.",
        "rate_limited",
      );
    }
    throw new ResearchProviderError(
      `Instagram returned ${response.status}: ${body.slice(0, 200)}`,
      "upstream",
    );
  }
  return JSON.parse(body) as T;
}

/** Strip @, a profile URL, or trailing slashes down to a bare username. */
export function parseInstagramInput(raw: string): string {
  const input = raw.trim();
  const url = input.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  if (url) return url[1];
  return input.replace(/^@/, "").replace(/\/+$/, "");
}

interface DiscoveryEnvelope {
  business_discovery?: {
    id?: string;
    username?: string;
    name?: string;
    profile_picture_url?: string;
    followers_count?: number;
    media?: { data?: MediaNode[] };
  };
}

interface MediaNode {
  id: string;
  caption?: string;
  like_count?: number;
  comments_count?: number;
  media_type?: string;
  media_product_type?: string;
  permalink?: string;
  thumbnail_url?: string;
  media_url?: string;
  timestamp?: string;
}

function discoveryUrl(
  accountId: string,
  token: string,
  username: string,
  mediaFields: string | null,
): URL {
  const url = new URL(`${GRAPH}/${accountId}`);
  const inner = mediaFields
    ? `{id,username,name,profile_picture_url,followers_count,media.limit(50){${mediaFields}}}`
    : `{id,username,name,profile_picture_url,followers_count}`;
  url.searchParams.set(
    "fields",
    `business_discovery.username(${username})${inner}`,
  );
  url.searchParams.set("access_token", token);
  return url;
}

async function resolveSource(
  input: string,
  ctx: ProviderContext,
): Promise<SourceIdentity> {
  const { token, accountId } = requireContext(ctx);
  const username = parseInstagramInput(input);
  if (!username) {
    throw new ResearchProviderError("Enter an Instagram username", "not_found");
  }

  const data = await call<DiscoveryEnvelope>(
    discoveryUrl(accountId, token, username, null),
  );
  const found = data.business_discovery;
  if (!found?.id) {
    throw new ResearchProviderError(
      `No public Instagram business account called @${username}`,
      "not_found",
    );
  }
  return {
    platform: "instagram",
    externalId: found.id,
    handle: found.username ? `@${found.username}` : `@${username}`,
    title: found.name || found.username || username,
    thumbnailUrl: found.profile_picture_url ?? null,
    followerCount: found.followers_count ?? null,
  };
}

async function listVideos(
  source: SourceIdentity,
  ctx: ProviderContext,
): Promise<SourceVideo[]> {
  const { token, accountId } = requireContext(ctx);
  // business_discovery is keyed by username, not id — the handle is stored on
  // the source precisely so a later sync can repeat the lookup.
  const username = (source.handle ?? "").replace(/^@/, "");
  if (!username) {
    throw new ResearchProviderError(
      "This Instagram source is missing its username and cannot be synced",
      "not_found",
    );
  }

  const data = await call<DiscoveryEnvelope>(
    discoveryUrl(
      accountId,
      token,
      username,
      "id,caption,like_count,comments_count,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp",
    ),
  );

  return (data.business_discovery?.media?.data ?? []).map((node) => {
    const caption = (node.caption ?? "").trim();
    return {
      externalId: node.id,
      // Instagram posts have no title; the first line of the caption is what a
      // human would call the post, so it is the honest stand-in.
      title: caption.split("\n")[0]?.slice(0, 120) || "(no caption)",
      description: caption || null,
      url: node.permalink ?? `https://www.instagram.com/p/${node.id}/`,
      thumbnailUrl: node.thumbnail_url ?? node.media_url ?? null,
      publishedAt: node.timestamp ?? null,
      durationSeconds: null,
      // Business discovery gives no view counts. Likes stand in as the
      // performance signal, and the UI labels it as likes for this platform.
      viewCount: node.like_count ?? null,
      likeCount: node.like_count ?? null,
      commentCount: node.comments_count ?? null,
    };
  });
}

export const instagramResearch: ResearchProvider = {
  platform: "instagram",
  label: "Instagram",
  capabilities: {
    discoverAnyChannel: true,
    requiresConnection: true,
    ownContentOnly: false,
    meteredReads: false,
    transcripts: false,
  },
  requiredEnv: [],
  resolveSource,
  listVideos,
};
