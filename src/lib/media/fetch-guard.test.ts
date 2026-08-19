import { describe, expect, it } from "vitest";

import { assertSafeMediaUrl, isPrivateAddress, UnsafeMediaUrlError } from "./fetch-guard";

// YouTube and Snapchat make the SERVER fetch the media URL. These pin what
// the server refuses to fetch.

describe("isPrivateAddress", () => {
  it("flags every non-public v4 range that matters", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "255.255.255.255",
      "192.0.0.1",
      "198.18.0.1",
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it("passes ordinary public v4 addresses", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "172.15.0.1", "100.63.0.1", "104.16.0.1"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it("handles v6 loopback, unspecified, ULA, link-local, multicast, and mapped v4", () => {
    for (const ip of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    expect(isPrivateAddress("2606:4700::1111")).toBe(false);
    expect(isPrivateAddress("::ffff:8.8.8.8")).toBe(false);
  });
});

describe("assertSafeMediaUrl", () => {
  const resolvePublic = async () => ["104.16.1.1"];
  const resolvePrivate = async () => ["104.16.1.1", "10.0.0.5"]; // any private answer poisons it

  it("always trusts our own storage prefix, without resolving anything", async () => {
    const resolve = async () => {
      throw new Error("must not resolve");
    };
    await expect(
      assertSafeMediaUrl("https://pub-abc.r2.dev/u/w/file.mp4", {
        trustedPrefix: "https://pub-abc.r2.dev/",
        resolve,
      }),
    ).resolves.toBeInstanceOf(URL);
  });

  it("does not let a lookalike host ride the prefix", async () => {
    await expect(
      assertSafeMediaUrl("https://pub-abc.r2.dev.evil.example/x.mp4", {
        trustedPrefix: "https://pub-abc.r2.dev",
        resolve: async () => ["127.0.0.1"],
      }),
    ).rejects.toBeInstanceOf(UnsafeMediaUrlError);
  });

  it("refuses non-http schemes, credentials, localhost, and IP literals in private ranges", async () => {
    for (const url of [
      "file:///etc/passwd",
      "ftp://example.com/a",
      "https://user:pw@example.com/a",
      "http://localhost:3000/api/internal/scheduler/tick",
      "http://app.localhost/x",
      "http://127.0.0.1/x",
      "http://169.254.169.254/metadata/v1/user-data",
      "http://[::1]/x",
      "http://10.0.0.1/x",
    ]) {
      await expect(assertSafeMediaUrl(url, { resolve: resolvePublic }), url).rejects.toBeInstanceOf(
        UnsafeMediaUrlError,
      );
    }
  });

  it("refuses a hostname that resolves (even partly) to a private address", async () => {
    await expect(
      assertSafeMediaUrl("https://cdn.example/x.mp4", { resolve: resolvePrivate }),
    ).rejects.toThrow(/private address/);
    await expect(
      assertSafeMediaUrl("https://cdn.example/x.mp4", { resolve: async () => [] }),
    ).rejects.toThrow(/does not resolve/);
  });

  it("accepts a public host", async () => {
    await expect(
      assertSafeMediaUrl("https://cdn.example/x.mp4", { resolve: resolvePublic }),
    ).resolves.toBeInstanceOf(URL);
  });
});
