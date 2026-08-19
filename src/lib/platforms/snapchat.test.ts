import { createDecipheriv } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PlatformApiError } from "./errors";
import { snapchat, uploadTuning } from "./snapchat";

// Snap's upload is AES-256-CBC ciphertext in ≤32MB parts. The review on
// 2026-08-19 found the first version buffered the whole video 2–3x in
// memory; this pins the streaming replacement: parts arrive in order, the
// ciphertext decrypts back to the original bytes with the key/IV handed to
// Snap, memory never holds more than one part, oversize is refused up front,
// and an unsafe URL is refused before any byte moves.

function chunked(chunks: Uint8Array[], gapMs = 2): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const chunk of chunks) {
        await new Promise((r) => setTimeout(r, gapMs));
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

const input = {
  caption: "hi",
  media: [{ url: "https://storage.example/v.mp4", type: "video" as const }],
  tokens: { accessToken: "at" },
  platformAccountId: "profile-1",
};

describe("snapchat.publish streaming upload", () => {
  const realFetch = globalThis.fetch;
  const realPart = uploadTuning.partBytes;
  beforeEach(() => {
    process.env.SNAPCHAT_CLIENT_ID = "id";
    process.env.SNAPCHAT_CLIENT_SECRET = "secret";
    process.env.R2_PUBLIC_BASE_URL = "https://storage.example";
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    uploadTuning.partBytes = realPart;
    delete process.env.SNAPCHAT_CLIENT_ID;
    delete process.env.SNAPCHAT_CLIENT_SECRET;
    delete process.env.R2_PUBLIC_BASE_URL;
  });

  function stub(source: { chunks: Uint8Array[]; contentLength?: string }) {
    const calls: string[] = [];
    const parts: { number: number; bytes: Buffer }[] = [];
    let key = "";
    let iv = "";
    let finalized = false;
    let spotlightBody: unknown = null;
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const href = String(url instanceof Request ? url.url : url);
      calls.push(`${init?.method ?? "GET"} ${href}`);
      if (href.startsWith("https://storage.example/")) {
        return new Response(chunked(source.chunks), {
          status: 200,
          headers: source.contentLength ? { "content-length": source.contentLength } : {},
        });
      }
      if (href.endsWith("/public_profiles/profile-1/media")) {
        const body = JSON.parse(String(init?.body));
        key = body.key;
        iv = body.iv;
        return Response.json({
          request_status: "SUCCESS",
          media: { id: "media-1", add_path: "/v1/media/media-1/multipart-upload-v2?action=ADD", finalize_path: "/v1/media/media-1/multipart-upload-v2?action=FINALIZE" },
        });
      }
      if (href.includes("multipart-upload-v2")) {
        const form = init?.body as FormData;
        if (form.get("action") === "ADD") {
          const file = form.get("file") as Blob;
          parts.push({ number: Number(form.get("part_number")), bytes: Buffer.from(await file.arrayBuffer()) });
        } else {
          finalized = true;
        }
        return Response.json({ request_status: "SUCCESS" });
      }
      if (href.endsWith("/spotlights")) {
        spotlightBody = JSON.parse(String(init?.body));
        return Response.json({ request_status: "SUCCESS", spotlight_id: "spot-9" });
      }
      throw new Error(`unexpected ${href}`);
    }) as typeof fetch;
    return {
      calls,
      parts,
      get key() {
        return key;
      },
      get iv() {
        return iv;
      },
      get finalized() {
        return finalized;
      },
      get spotlightBody() {
        return spotlightBody;
      },
    };
  }

  it("streams the body through AES-256-CBC in ordered parts that decrypt back to the original", async () => {
    uploadTuning.partBytes = 1024; // tiny parts so a few KB exercises the multi-part path
    const original = Buffer.alloc(5000);
    for (let i = 0; i < original.length; i++) original[i] = (i * 7) & 0xff;
    const chunks = [original.subarray(0, 1500), original.subarray(1500, 1501), original.subarray(1501, 4000), original.subarray(4000)];
    const s = stub({ chunks: chunks.map((c) => new Uint8Array(c)), contentLength: String(original.length) });

    const result = await snapchat.publish(input);
    expect(result.platformPostId).toBe("spot-9");

    // Ordered, sized parts: every part except the last is exactly partBytes.
    expect(s.parts.map((p) => p.number)).toEqual([1, 2, 3, 4, 5]);
    for (const part of s.parts.slice(0, -1)) expect(part.bytes.length).toBe(1024);
    // Ciphertext = plaintext rounded up to the next 16-byte block (PKCS#7).
    const ciphertext = Buffer.concat(s.parts.map((p) => p.bytes));
    expect(ciphertext.length).toBe(Math.floor(original.length / 16) * 16 + 16);

    const decipher = createDecipheriv("aes-256-cbc", Buffer.from(s.key, "base64"), Buffer.from(s.iv, "base64"));
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    expect(plain.equals(original)).toBe(true);

    expect(s.finalized).toBe(true);
    expect(s.spotlightBody).toMatchObject({ media_id: "media-1", description: "hi" });
    // Order: storage, container, parts…, finalize, spotlight.
    expect(s.calls[0]).toMatch(/^GET https:\/\/storage\.example/);
    expect(s.calls[1]).toMatch(/\/media$/);
    expect(s.calls[s.calls.length - 1]).toMatch(/\/spotlights$/);
  });

  it("sends exactly one part for a small file", async () => {
    const s = stub({ chunks: [new Uint8Array([1, 2, 3, 4, 5])] });
    await snapchat.publish(input);
    expect(s.parts).toHaveLength(1);
    expect(s.parts[0].bytes.length).toBe(16);
  });

  it("refuses a declared size over 1GB before creating a container", async () => {
    const s = stub({ chunks: [new Uint8Array([1])], contentLength: String(1024 * 1024 * 1024 + 1) });
    const err = await snapchat.publish(input).catch((e) => e);
    expect(err).toBeInstanceOf(PlatformApiError);
    expect(err.retryable).toBe(false);
    expect(err.message).toMatch(/allows 1GB/);
    expect(s.calls.some((c) => c.endsWith("/media"))).toBe(false);
  });

  it("refuses to fetch a private address as media", async () => {
    const s = stub({ chunks: [] });
    const err = await snapchat
      .publish({ ...input, media: [{ url: "http://169.254.169.254/latest/meta-data", type: "video" }] })
      .catch((e) => e);
    expect(err).toBeInstanceOf(PlatformApiError);
    expect(err.message).toMatch(/media URL refused/);
    expect(s.calls).toHaveLength(0);
  });
});
