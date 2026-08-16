import { describe, expect, it } from "vitest";

import {
  buildObjectKey,
  checkUpload,
  formatBytes,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  publicUrlFor,
} from "./policy";

describe("checkUpload", () => {
  it("accepts the supported image types and maps them to extensions", () => {
    expect(checkUpload("image/jpeg", 1000)).toEqual({
      ok: true,
      kind: "image",
      extension: "jpg",
    });
    expect(checkUpload("image/png", 1000)).toMatchObject({ extension: "png" });
    expect(checkUpload("image/webp", 1000)).toMatchObject({ extension: "webp" });
  });

  it("accepts the supported video types", () => {
    expect(checkUpload("video/mp4", 1000)).toEqual({
      ok: true,
      kind: "video",
      extension: "mp4",
    });
    expect(checkUpload("video/quicktime", 1000)).toMatchObject({ extension: "mov" });
  });

  it("tolerates a charset parameter and odd casing from the browser", () => {
    expect(checkUpload("IMAGE/JPEG; charset=binary", 1000)).toMatchObject({
      ok: true,
      kind: "image",
    });
  });

  it("refuses unsupported types", () => {
    for (const type of ["image/gif", "application/pdf", "text/html", "", "image/svg+xml"]) {
      const result = checkUpload(type, 1000);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/not supported/);
    }
  });

  it("refuses an empty or nonsense size", () => {
    expect(checkUpload("image/jpeg", 0).ok).toBe(false);
    expect(checkUpload("image/jpeg", -1).ok).toBe(false);
    expect(checkUpload("image/jpeg", Number.NaN).ok).toBe(false);
  });

  it("holds images to Instagram's 8MB ceiling, at the boundary", () => {
    expect(checkUpload("image/jpeg", MAX_IMAGE_BYTES).ok).toBe(true);
    const over = checkUpload("image/jpeg", MAX_IMAGE_BYTES + 1);
    expect(over.ok).toBe(false);
    if (!over.ok) {
      expect(over.reason).toContain("8MB");
      expect(over.reason).toContain("Instagram");
    }
  });

  it("holds videos to 300MB, at the boundary", () => {
    expect(checkUpload("video/mp4", MAX_VIDEO_BYTES).ok).toBe(true);
    expect(checkUpload("video/mp4", MAX_VIDEO_BYTES + 1).ok).toBe(false);
    // A video is allowed to be far larger than an image.
    expect(checkUpload("video/mp4", MAX_IMAGE_BYTES + 1).ok).toBe(true);
  });
});

describe("buildObjectKey", () => {
  it("uses our own path and never the caller's filename", () => {
    expect(
      buildObjectKey({
        userId: "u-1",
        workspaceId: "w-1",
        extension: "jpg",
        random: "abc123",
      }),
    ).toBe("u-1/w-1/abc123.jpg");
  });
});

describe("publicUrlFor", () => {
  it("joins the base and key with exactly one slash", () => {
    expect(publicUrlFor("https://pub-x.r2.dev", "a/b.jpg")).toBe(
      "https://pub-x.r2.dev/a/b.jpg",
    );
    expect(publicUrlFor("https://pub-x.r2.dev/", "a/b.jpg")).toBe(
      "https://pub-x.r2.dev/a/b.jpg",
    );
    expect(publicUrlFor("https://media.markedfox.com///", "a/b.jpg")).toBe(
      "https://media.markedfox.com/a/b.jpg",
    );
  });
});

describe("formatBytes", () => {
  it("reads the way a person would say it", () => {
    expect(formatBytes(8 * 1024 * 1024)).toBe("8MB");
    expect(formatBytes(2048)).toBe("2KB");
    expect(formatBytes(512)).toBe("512 bytes");
  });
});
