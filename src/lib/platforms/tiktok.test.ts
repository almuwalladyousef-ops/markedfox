import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  planTikTokChunks,
  pushTikTokChunks,
  TIKTOK_CHUNK_BYTES,
  tiktokAdapter,
  tiktokVideoContentType,
} from "./tiktok";

// The video path TikTok's reviewer watches: our server reads the file from
// storage and PUTs it to TikTok in chunks, for a direct post (video.publish)
// or a draft in the creator's inbox (video.upload).

const MB = 1024 * 1024;

function streamOf(bytes: Uint8Array, piece = 3 * MB): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.byteLength) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.subarray(offset, offset + piece));
      offset += piece;
    },
  });
}

describe("planTikTokChunks", () => {
  it("sends a file of one chunk or less whole", () => {
    expect(planTikTokChunks(4 * MB)).toEqual({
      videoSize: 4 * MB,
      chunkSize: 4 * MB,
      totalChunkCount: 1,
      ranges: [[0, 4 * MB - 1]],
    });
    expect(planTikTokChunks(TIKTOK_CHUNK_BYTES).totalChunkCount).toBe(1);
  });

  it("rounds the chunk count down and gives the remainder to the last chunk", () => {
    const size = 25 * MB + 7;
    const plan = planTikTokChunks(size);
    expect(plan.chunkSize).toBe(TIKTOK_CHUNK_BYTES);
    expect(plan.totalChunkCount).toBe(2);
    expect(plan.ranges).toEqual([
      [0, TIKTOK_CHUNK_BYTES - 1],
      [TIKTOK_CHUNK_BYTES, size - 1],
    ]);
  });

  it("refuses a size it cannot plan", () => {
    expect(() => planTikTokChunks(0)).toThrow(/size/);
    expect(() => planTikTokChunks(Number.NaN)).toThrow(/size/);
    expect(() => planTikTokChunks(1001 * TIKTOK_CHUNK_BYTES)).toThrow(/too large/);
  });
});

describe("tiktokVideoContentType", () => {
  it("uses a mime TikTok accepts, or reads the extension", () => {
    expect(tiktokVideoContentType({ url: "https://r2/a.mp4", mime: "video/quicktime" })).toBe(
      "video/quicktime",
    );
    expect(tiktokVideoContentType({ url: "https://r2/a.MOV?x=1" })).toBe("video/quicktime");
    expect(tiktokVideoContentType({ url: "https://r2/a.webm" })).toBe("video/webm");
    expect(tiktokVideoContentType({ url: "https://r2/a" })).toBe("video/mp4");
  });
});

describe("pushTikTokChunks", () => {
  it("PUTs every planned range with the matching bytes and Content-Range", async () => {
    const size = 25 * MB + 7;
    const bytes = new Uint8Array(size).map((_, i) => i % 251);
    const plan = planTikTokChunks(size);
    const calls: { range: string; length: number; first: number }[] = [];
    const put = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      const body = init?.body as Uint8Array;
      calls.push({ range: headers["Content-Range"], length: body.byteLength, first: body[0] });
      return new Response(null, { status: calls.length === plan.totalChunkCount ? 201 : 206 });
    });

    await pushTikTokChunks(streamOf(bytes), plan, "https://upload", "video/mp4", put as typeof fetch);

    expect(calls).toEqual([
      { range: `bytes 0-${TIKTOK_CHUNK_BYTES - 1}/${size}`, length: TIKTOK_CHUNK_BYTES, first: 0 },
      {
        range: `bytes ${TIKTOK_CHUNK_BYTES}-${size - 1}/${size}`,
        length: size - TIKTOK_CHUNK_BYTES,
        first: TIKTOK_CHUNK_BYTES % 251,
      },
    ]);
  });

  it("fails loudly when storage sends fewer bytes than it declared", async () => {
    const plan = planTikTokChunks(12 * MB);
    const put = vi.fn(async () => new Response(null, { status: 206 }));
    await expect(
      pushTikTokChunks(streamOf(new Uint8Array(11 * MB)), plan, "https://upload", "video/mp4", put as typeof fetch),
    ).rejects.toThrow(/different number of bytes/);
  });

  it("stops on a refused chunk", async () => {
    const plan = planTikTokChunks(4 * MB);
    const put = vi.fn(async () => new Response(null, { status: 400 }));
    await expect(
      pushTikTokChunks(streamOf(new Uint8Array(4 * MB)), plan, "https://upload", "video/mp4", put as typeof fetch),
    ).rejects.toThrow(/HTTP 400/);
  });
});

describe("tiktokAdapter.publish", () => {
  const R2 = "https://pub-test.r2.dev";
  const video = new Uint8Array(4 * MB);
  let requests: { url: string; method: string; body?: unknown }[];

  beforeEach(() => {
    process.env.R2_PUBLIC_BASE_URL = R2;
    requests = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        const json = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
        requests.push({ url, method, body: json });
        const ok = (data: unknown) =>
          new Response(JSON.stringify({ data, error: { code: "ok" } }), { status: 200 });

        if (url.startsWith(R2)) {
          return new Response(streamOf(video), {
            status: 200,
            headers: { "content-length": String(video.byteLength) },
          });
        }
        if (url.endsWith("/post/publish/creator_info/query/")) {
          return ok({ creator_username: "fox", privacy_level_options: ["SELF_ONLY"] });
        }
        if (url.endsWith("/post/publish/inbox/video/init/") || url.endsWith("/post/publish/video/init/")) {
          return ok({ publish_id: "p1", upload_url: "https://upload.tiktok/u1" });
        }
        if (url === "https://upload.tiktok/u1") return new Response(null, { status: 201 });
        if (url.endsWith("/post/publish/status/fetch/")) {
          const inbox = requests.some((r) => r.url.endsWith("/inbox/video/init/"));
          return ok({ status: inbox ? "SEND_TO_USER_INBOX" : "PUBLISH_COMPLETE" });
        }
        return new Response("unexpected", { status: 500 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.R2_PUBLIC_BASE_URL;
  });

  const base = {
    caption: "hello",
    media: [{ url: `${R2}/v.mp4`, type: "video" as const }],
    platformAccountId: "open-id",
  };

  it("sends a draft to the inbox by FILE_UPLOAD, with no privacy level and no creator_info", async () => {
    const result = await tiktokAdapter.publish({
      ...base,
      tokens: { accessToken: "t", scopes: ["video.upload"] },
      options: { post_mode: "inbox" },
    });

    expect(result).toEqual({ platformPostId: "p1" });
    expect(requests.some((r) => r.url.endsWith("/creator_info/query/"))).toBe(false);
    const init = requests.find((r) => r.url.endsWith("/inbox/video/init/"));
    expect(init?.body).toEqual({
      source_info: {
        source: "FILE_UPLOAD",
        video_size: video.byteLength,
        chunk_size: video.byteLength,
        total_chunk_count: 1,
      },
    });
    expect(requests.some((r) => r.url === "https://upload.tiktok/u1" && r.method === "PUT")).toBe(true);
  });

  it("direct-posts by FILE_UPLOAD after checking creator_info", async () => {
    await tiktokAdapter.publish({
      ...base,
      tokens: { accessToken: "t" },
      options: { privacy_level: "SELF_ONLY" },
    });

    expect(requests.some((r) => r.url.endsWith("/creator_info/query/"))).toBe(true);
    const init = requests.find((r) => r.url.endsWith("/post/publish/video/init/"));
    expect(init?.body).toMatchObject({
      post_info: { title: "hello", privacy_level: "SELF_ONLY" },
      source_info: { source: "FILE_UPLOAD", video_size: video.byteLength },
    });
  });

  it("asks for a reconnect when the token was granted without video.upload", async () => {
    await expect(
      tiktokAdapter.publish({
        ...base,
        tokens: { accessToken: "t", scopes: ["video.publish"] },
        options: { post_mode: "inbox" },
      }),
    ).rejects.toThrow(/Reconnect TikTok/);
    expect(requests).toEqual([]);
  });
});
