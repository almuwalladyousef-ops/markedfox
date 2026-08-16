import { describe, expect, it } from "vitest";

import { presignUrl, uriEncode } from "./sigv4";

// The decisive test: AWS publishes a worked example of a presigned GET, with
// the expected signature spelled out ("Signature Calculation for a Presigned
// URL", Signature Version 4 documentation). Reproducing it byte for byte is
// what makes a hand-rolled signer trustworthy without a live bucket.
const AWS_EXAMPLE = {
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  region: "us-east-1",
  endpoint: "https://examplebucket.s3.amazonaws.com",
  key: "test.txt",
  now: new Date("2013-05-24T00:00:00Z"),
  expiresInSeconds: 86400,
  expectedSignature:
    "aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404",
};

describe("presignUrl", () => {
  it("reproduces AWS's published presigned-GET signature exactly", () => {
    const url = presignUrl({
      method: "GET",
      endpoint: AWS_EXAMPLE.endpoint,
      key: AWS_EXAMPLE.key,
      accessKeyId: AWS_EXAMPLE.accessKeyId,
      secretAccessKey: AWS_EXAMPLE.secretAccessKey,
      region: AWS_EXAMPLE.region,
      expiresInSeconds: AWS_EXAMPLE.expiresInSeconds,
      now: AWS_EXAMPLE.now,
    });

    const parsed = new URL(url);
    expect(parsed.searchParams.get("X-Amz-Signature")).toBe(
      AWS_EXAMPLE.expectedSignature,
    );
    expect(parsed.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(parsed.searchParams.get("X-Amz-Credential")).toBe(
      "AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request",
    );
    expect(parsed.searchParams.get("X-Amz-Date")).toBe("20130524T000000Z");
    expect(parsed.searchParams.get("X-Amz-Expires")).toBe("86400");
    expect(parsed.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
  });

  it("signs a PUT against an R2 endpoint with a pinned content-type", () => {
    const url = presignUrl({
      method: "PUT",
      endpoint: "https://abc123.r2.cloudflarestorage.com",
      key: "markedfox-media/u/1/photo.jpg",
      accessKeyId: "key",
      secretAccessKey: "secret",
      region: "auto",
      expiresInSeconds: 900,
      now: new Date("2026-08-16T12:00:00Z"),
      signedHeaders: { "content-type": "image/jpeg" },
    });

    const parsed = new URL(url);
    expect(parsed.origin).toBe("https://abc123.r2.cloudflarestorage.com");
    expect(parsed.pathname).toBe("/markedfox-media/u/1/photo.jpg");
    // Pinning content-type means a browser that sends something else is
    // rejected by R2 rather than storing a mislabelled object.
    expect(parsed.searchParams.get("X-Amz-SignedHeaders")).toBe(
      "content-type;host",
    );
    expect(parsed.searchParams.get("X-Amz-Credential")).toContain("/auto/s3/");
    expect(parsed.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same inputs and differs when any input changes", () => {
    const base = {
      method: "PUT" as const,
      endpoint: "https://abc123.r2.cloudflarestorage.com",
      key: "b/a.jpg",
      accessKeyId: "key",
      secretAccessKey: "secret",
      region: "auto",
      expiresInSeconds: 900,
      now: new Date("2026-08-16T12:00:00Z"),
    };
    expect(presignUrl(base)).toBe(presignUrl(base));
    expect(presignUrl({ ...base, key: "b/other.jpg" })).not.toBe(presignUrl(base));
    expect(presignUrl({ ...base, secretAccessKey: "other" })).not.toBe(
      presignUrl(base),
    );
    expect(
      presignUrl({ ...base, now: new Date("2026-08-16T12:00:01Z") }),
    ).not.toBe(presignUrl(base));
  });

  it("encodes each path segment without encoding the separators", () => {
    const url = presignUrl({
      method: "PUT",
      endpoint: "https://abc123.r2.cloudflarestorage.com",
      key: "bucket/a b/c+d.jpg",
      accessKeyId: "key",
      secretAccessKey: "secret",
      region: "auto",
      expiresInSeconds: 900,
      now: new Date("2026-08-16T12:00:00Z"),
    });
    expect(new URL(url).pathname).toBe("/bucket/a%20b/c%2Bd.jpg");
  });
});

describe("uriEncode", () => {
  it("follows RFC 3986, unlike encodeURIComponent", () => {
    // The characters encodeURIComponent leaves alone and AWS does not.
    expect(uriEncode("a!'()*b")).toBe("a%21%27%28%29%2Ab");
    expect(uriEncode("A-Za-z0-9-._~")).toBe("A-Za-z0-9-._~");
    expect(uriEncode("a/b")).toBe("a%2Fb");
    expect(uriEncode("a/b", false)).toBe("a/b");
    expect(uriEncode("é")).toBe("%C3%A9");
    expect(uriEncode(" ")).toBe("%20");
  });
});
