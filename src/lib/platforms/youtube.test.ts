import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlatformApiError, PlatformAuthError } from "./errors";
import { classifyUploadFailure, withStallWatchdog, youtube } from "./youtube";

// The resumable upload streams the R2 body straight into Google's PUT. The
// review on 2026-08-19 proved (on Node 22) that a timeout signal on the
// source fetch also aborts that PUT mid-stream the moment the timer fires —
// a 300MB video cannot finish inside 60s from the box, so every big upload
// died at exactly one minute as a non-retryable "fetch failed". These tests
// pin the replacement: headers-only timeout, a stall watchdog on the stream,
// and failure classification that retries transport and never retries
// Google's deterministic refusals.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function chunkedStream(chunks: string[], gapMs: number): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const chunk of chunks) {
        await sleep(gapMs);
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return out;
    out += decoder.decode(value, { stream: true });
  }
}

describe("withStallWatchdog", () => {
  it("passes every chunk through unchanged and never fires while bytes keep flowing", async () => {
    const onStall = vi.fn();
    const out = withStallWatchdog(chunkedStream(["a", "b", "c"], 20), onStall, 200);
    expect(await drain(out)).toBe("abc");
    await sleep(250); // past stallMs after completion: flush disarmed it
    expect(onStall).not.toHaveBeenCalled();
  });

  it("fires once the gap between chunks exceeds stallMs", async () => {
    const onStall = vi.fn();
    const out = withStallWatchdog(chunkedStream(["a", "b"], 150), onStall, 60);
    await drain(out);
    expect(onStall).toHaveBeenCalled();
  });
});

describe("classifyUploadFailure", () => {
  it("maps 401 to an auth error", () => {
    expect(classifyUploadFailure(401, { error: { message: "Invalid Credentials" } })).toBeInstanceOf(
      PlatformAuthError,
    );
  });

  it("never retries Google's deterministic refusals", () => {
    for (const [status, reason] of [
      [403, "quotaExceeded"],
      [403, "uploadLimitExceeded"],
      [400, "invalidTitle"],
      [403, "forbidden"],
    ] as const) {
      const err = classifyUploadFailure(status, {
        error: { message: reason, errors: [{ reason }] },
      });
      expect(err).toBeInstanceOf(PlatformApiError);
      expect((err as PlatformApiError).retryable).toBe(false);
    }
  });

  it("retries transport-shaped statuses", () => {
    for (const status of [500, 502, 503, 408, 429, 308]) {
      const err = classifyUploadFailure(status, {});
      expect((err as PlatformApiError).retryable).toBe(true);
    }
  });
});

describe("youtube.publish streaming", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "gid";
    process.env.GOOGLE_CLIENT_SECRET = "gsecret";
    // The fetch guard trusts our storage by prefix and resolves anything
    // else through DNS — storage.example is the trusted prefix here.
    process.env.R2_PUBLIC_BASE_URL = "https://storage.example";
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.R2_PUBLIC_BASE_URL;
  });

  // A fetch stub that plays storage, the session endpoint, and the upload
  // endpoint. The upload endpoint DRAINS the request body so the test sees
  // exactly what Google would have received.
  function stubFetch(options: {
    sourceChunks?: string[];
    gapMs?: number;
    putResponse?: () => Response | Promise<Response>;
    putThrows?: Error;
  }) {
    const received: { body: string; headers: Record<string, string> }[] = [];
    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.startsWith("https://storage.example/")) {
        return new Response(chunkedStream(options.sourceChunks ?? ["hello ", "world"], options.gapMs ?? 5), {
          status: 200,
          headers: { "content-type": "video/mp4", "content-length": "11" },
        });
      }
      if (url.startsWith("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable")) {
        return new Response(null, {
          status: 200,
          headers: { location: "https://upload.example/session/1" },
        });
      }
      if (url.startsWith("https://upload.example/session/")) {
        if (options.putThrows) throw options.putThrows;
        const body = init?.body as ReadableStream<Uint8Array>;
        received.push({
          body: await drain(body),
          headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)),
        });
        return options.putResponse
          ? await options.putResponse()
          : new Response(JSON.stringify({ id: "vid123" }), { status: 200 });
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;
    return { received, calls };
  }

  const input = {
    caption: "Title line\nThe description",
    media: [{ url: "https://storage.example/v.mp4", type: "video" as const }],
    tokens: { accessToken: "at" },
    platformAccountId: "chan",
  };

  it("streams the storage body into the resumable PUT and returns the video id", async () => {
    const { received, calls } = stubFetch({});
    const result = await youtube.publish(input);
    expect(result).toEqual({
      platformPostId: "vid123",
      url: "https://www.youtube.com/watch?v=vid123",
    });
    expect(received).toHaveLength(1);
    expect(received[0].body).toBe("hello world");
    expect(received[0].headers["Content-Length"]).toBe("11");
    expect(received[0].headers["Content-Type"]).toBe("video/mp4");
    expect(calls[0]).toMatch(/^GET https:\/\/storage\.example/);
    expect(calls[1]).toMatch(/^POST .*uploadType=resumable/);
    expect(calls[2]).toMatch(/^PUT https:\/\/upload\.example/);
  });

  it("reports a PUT that dies on the wire as retryable, not as an opaque fetch failure", async () => {
    stubFetch({ putThrows: new TypeError("fetch failed", { cause: new Error("other side closed") }) });
    const err = await youtube.publish(input).catch((e) => e);
    expect(err).toBeInstanceOf(PlatformApiError);
    expect(err.retryable).toBe(true);
    expect(err.message).toContain("upload interrupted");
    expect(err.message).toContain("other side closed");
  });

  it("does not retry an uploadLimitExceeded refusal", async () => {
    stubFetch({
      putResponse: () =>
        new Response(
          JSON.stringify({
            error: { code: 403, message: "limit", errors: [{ reason: "uploadLimitExceeded" }] },
          }),
          { status: 403 },
        ),
    });
    const err = await youtube.publish(input).catch((e) => e);
    expect(err).toBeInstanceOf(PlatformApiError);
    expect(err.retryable).toBe(false);
    expect(err.message).toContain("upload limit");
  });

  it("refuses to fetch a private address as media, before any request", async () => {
    const { calls } = stubFetch({});
    const err = await youtube
      .publish({ ...input, media: [{ url: "http://127.0.0.1:3000/api/internal/scheduler/tick", type: "video" }] })
      .catch((e) => e);
    expect(err).toBeInstanceOf(PlatformApiError);
    expect(err.retryable).toBe(false);
    expect(err.message).toMatch(/media URL refused/);
    expect(calls).toHaveLength(0);
  });

  it("retries a 503 from the upload endpoint", async () => {
    stubFetch({
      putResponse: () => new Response(JSON.stringify({ error: { message: "Backend Error" } }), { status: 503 }),
    });
    const err = await youtube.publish(input).catch((e) => e);
    expect(err).toBeInstanceOf(PlatformApiError);
    expect(err.retryable).toBe(true);
  });
});
