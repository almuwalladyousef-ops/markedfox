import { describe, expect, it } from "vitest";

import {
  buildObjectKey,
  checkUpload,
  formatBytes,
  MAX_IMAGE_BYTES,
  MAX_LONG_VIDEO_BYTES,
  MAX_PARTS,
  MAX_SHORT_VIDEO_BYTES,
  MIN_PART_BYTES,
  partCountFor,
  partSizeFor,
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

  it("holds a short video to 1GB, at the boundary", () => {
    expect(checkUpload("video/mp4", MAX_SHORT_VIDEO_BYTES).ok).toBe(true);
    expect(checkUpload("video/mp4", MAX_SHORT_VIDEO_BYTES + 1).ok).toBe(false);
    // A video is allowed to be far larger than an image.
    expect(checkUpload("video/mp4", MAX_IMAGE_BYTES + 1).ok).toBe(true);
  });

  it("holds a long video to YouTube's ceiling instead", () => {
    expect(
      checkUpload("video/mp4", MAX_SHORT_VIDEO_BYTES + 1, "long").ok,
    ).toBe(true);
    expect(checkUpload("video/mp4", MAX_LONG_VIDEO_BYTES, "long").ok).toBe(true);
    expect(checkUpload("video/mp4", MAX_LONG_VIDEO_BYTES + 1, "long").ok).toBe(
      false,
    );
  });

  // The refusal has to say what to do about it, or "Short videos must be
  // under 1GB" reads as "this app cannot take my file".
  it("points a too-large short video at the Long video option", () => {
    const over = checkUpload("video/mp4", MAX_SHORT_VIDEO_BYTES + 1);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.reason).toContain("Long video");
  });

  it("judges an image by the same number whatever the post is", () => {
    expect(checkUpload("image/jpeg", MAX_IMAGE_BYTES + 1, "long").ok).toBe(false);
  });
});

describe("part sizing", () => {
  it("uses the floor part size until the part count would run out", () => {
    expect(partSizeFor(1024)).toBe(MIN_PART_BYTES);
    expect(partSizeFor(MIN_PART_BYTES * 100)).toBe(MIN_PART_BYTES);
  });

  // R2 allows 10,000 parts and no more, so past ~640GB the part size has to
  // grow. The ceiling is 256GB, but the arithmetic should not depend on that.
  it("grows the part size rather than exceeding the part cap", () => {
    const huge = MIN_PART_BYTES * MAX_PARTS * 3;
    const part = partSizeFor(huge);
    expect(part).toBeGreaterThan(MIN_PART_BYTES);
    expect(partCountFor(huge, part)).toBeLessThanOrEqual(MAX_PARTS);
  });

  it("keeps every real file inside the part cap", () => {
    for (const size of [1, MIN_PART_BYTES + 1, MAX_LONG_VIDEO_BYTES]) {
      expect(partCountFor(size, partSizeFor(size))).toBeLessThanOrEqual(MAX_PARTS);
    }
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
