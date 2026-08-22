import { afterEach, describe, expect, it, vi } from "vitest";

import { listRegisteredPlatforms, getPlatform } from "./registry";
import type { ConnectionTokens } from "./types";

// The home screen reads every connected account through adapter.insights. What
// is worth pinning here is the shape of what comes back — because a card that
// labels likes as views, or shows 0 where a platform reported nothing, is
// wrong in a way nobody looking at the screen can catch.

const tokens: ConnectionTokens = { accessToken: "token" };

function reply(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("insights coverage", () => {
  it("declares a metric and the scopes it needs, on every platform that has a read API", () => {
    for (const adapter of listRegisteredPlatforms()) {
      if (!adapter.insights) continue;
      expect(["views", "likes"]).toContain(adapter.insights.primaryMetric);
      expect(adapter.insights.requiredScopes.length).toBeGreaterThan(0);
    }
  });

  it("marks X, and only X, as billed per read", () => {
    const metered = listRegisteredPlatforms()
      .filter((adapter) => adapter.insights?.metered)
      .map((adapter) => adapter.id);
    expect(metered).toEqual(["x"]);
  });

  it("leaves Snapchat without insights, because it has no content API at all", () => {
    // Not an oversight: Snapchat exposes nothing to read back, which is why
    // the home screen says so on the account instead of showing an empty grid.
    expect(getPlatform("snapchat").insights).toBeUndefined();
  });
});

describe("instagram insights", () => {
  it("carries likes as the headline and never invents a view count", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        reply({
          data: [
            {
              id: "17900000000000000",
              caption: "a reel",
              media_type: "VIDEO",
              permalink: "https://www.instagram.com/reel/DcHDcalAYEt/",
              thumbnail_url: "https://cdn.example/thumb.jpg",
              timestamp: "2026-08-16T10:00:00+0000",
              like_count: 240,
              comments_count: 12,
            },
            {
              id: "17900000000000001",
              media_type: "IMAGE",
              media_url: "https://cdn.example/photo.jpg",
              like_count: 0,
            },
          ],
        }),
      ),
    );

    const items = await getPlatform("instagram").insights!.listMedia({
      tokens,
      platformAccountId: "1784",
    });

    expect(items[0]).toMatchObject({
      externalId: "17900000000000000",
      kind: "video",
      likes: 240,
      comments: 12,
      // Business media reads do not include plays, and the metric label says
      // "likes" for exactly this reason.
      views: null,
      thumbnailUrl: "https://cdn.example/thumb.jpg",
    });
    // A photo has no thumbnail_url; the image itself is the thumbnail.
    expect(items[1]).toMatchObject({
      kind: "photo",
      thumbnailUrl: "https://cdn.example/photo.jpg",
      likes: 0,
    });
    expect(getPlatform("instagram").insights!.primaryMetric).toBe("likes");
  });

  it("reads followers, following and post count off the profile", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        reply({
          username: "yous_ef_almu",
          name: "Personal account",
          followers_count: 30_000,
          follows_count: 2,
          media_count: 79,
        }),
      ),
    );

    const profile = await getPlatform("instagram").insights!.readProfile({
      tokens,
      platformAccountId: "1784",
    });
    expect(profile).toMatchObject({
      handle: "yous_ef_almu",
      followers: 30_000,
      following: 2,
      postCount: 79,
      profileUrl: "https://www.instagram.com/yous_ef_almu/",
    });
  });
});

describe("facebook insights", () => {
  it("tells a video, a photo and a plain status apart", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        reply({
          data: [
            {
              id: "1_1",
              message: "clip",
              attachments: { data: [{ media_type: "video" }] },
              reactions: { summary: { total_count: 5 } },
              comments: { summary: { total_count: 1 } },
            },
            {
              id: "1_2",
              full_picture: "https://cdn.example/p.jpg",
              attachments: { data: [{ media_type: "photo" }] },
            },
            { id: "1_3", message: "just words" },
          ],
        }),
      ),
    );

    const items = await getPlatform("facebook").insights!.listMedia({
      tokens,
      platformAccountId: "page-1",
    });
    expect(items.map((item) => item.kind)).toEqual(["video", "photo", "text"]);
    expect(items[0]).toMatchObject({ likes: 5, comments: 1, views: null });
  });
});

describe("youtube insights", () => {
  it("turns the string statistics into numbers, and a hidden count into null", async () => {
    const responses = [
      // channels.list for the uploads playlist
      reply({ items: [{ contentDetails: { relatedPlaylists: { uploads: "UU123" } } }] }),
      // playlistItems.list
      reply({ items: [{ contentDetails: { videoId: "abc" } }, { contentDetails: { videoId: "def" } }] }),
      // videos.list
      reply({
        items: [
          {
            id: "abc",
            snippet: {
              title: "Qwen 3.8 just got cracked",
              publishedAt: "2026-08-18T06:03:00Z",
              thumbnails: { medium: { url: "https://i.ytimg.com/abc.jpg" } },
            },
            statistics: { viewCount: "53000", likeCount: "2100", commentCount: "88" },
          },
          {
            id: "def",
            snippet: { title: "older" },
            // A channel that hides its likes returns no field at all.
            statistics: { viewCount: "1200" },
          },
        ],
      }),
    ];
    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async () => responses[call++]));

    const items = await getPlatform("youtube").insights!.listMedia({
      tokens,
      platformAccountId: "UC123",
    });

    expect(items[0]).toMatchObject({
      externalId: "abc",
      kind: "video",
      views: 53_000,
      likes: 2_100,
      comments: 88,
      permalink: "https://www.youtube.com/watch?v=abc",
    });
    expect(items[1].views).toBe(1_200);
    expect(items[1].likes).toBeNull();
  });
});

describe("tiktok insights", () => {
  it("reads the connected account's own videos with real view counts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        reply({
          data: {
            videos: [
              {
                id: "7300",
                title: "a 24-hour agent",
                cover_image_url: "https://cdn.tiktok/c.jpg",
                share_url: "https://www.tiktok.com/@me/video/7300",
                create_time: 1_787_000_000,
                view_count: 5_467,
                like_count: 300,
                comment_count: 20,
                share_count: 9,
              },
            ],
          },
        }),
      ),
    );

    const items = await getPlatform("tiktok").insights!.listMedia({
      tokens,
      platformAccountId: "open-id",
    });
    expect(items[0]).toMatchObject({
      externalId: "7300",
      kind: "video",
      views: 5_467,
      shares: 9,
    });
    // create_time is unix seconds, not milliseconds.
    expect(items[0].postedAt).toBe(new Date(1_787_000_000 * 1000).toISOString());
    expect(getPlatform("tiktok").insights!.primaryMetric).toBe("views");
  });
});
