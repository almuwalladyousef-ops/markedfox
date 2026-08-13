import { describe, expect, it } from "vitest";

import { NotImplementedError, PlatformNotRegisteredError } from "./errors";
import { getPlatform, listRegisteredPlatforms } from "./registry";
import { PLATFORMS } from "./types";

describe("platform registry", () => {
  it("exposes all 8 known platforms in the union", () => {
    expect(PLATFORMS).toEqual([
      "instagram",
      "x",
      "threads",
      "facebook",
      "tiktok",
      "youtube",
      "linkedin",
      "pinterest",
    ]);
  });

  it("returns the Instagram adapter with its capabilities", () => {
    const adapter = getPlatform("instagram");
    expect(adapter.id).toBe("instagram");
    expect(adapter.displayName).toBe("Instagram");
    expect(adapter.capabilities.text).toBe(false);
    expect(adapter.capabilities.image).toBe(true);
    expect(adapter.capabilities.carousel).toBe(true);
  });

  it("throws for platforms without an adapter yet", () => {
    expect(() => getPlatform("tiktok")).toThrow(PlatformNotRegisteredError);
    expect(() => getPlatform("x")).toThrow(PlatformNotRegisteredError);
  });

  it("lists only registered adapters", () => {
    const ids = listRegisteredPlatforms().map((a) => a.id);
    expect(ids).toEqual(["instagram"]);
  });

  it("stub methods throw NotImplementedError, never silently succeed", async () => {
    const adapter = getPlatform("instagram");
    expect(() =>
      adapter.getAuthorizeUrl({ redirectUri: "https://example.com", state: "s" }),
    ).toThrow(NotImplementedError);
    await expect(
      adapter.connect({ code: "c", redirectUri: "https://example.com" }),
    ).rejects.toThrow(NotImplementedError);
    await expect(adapter.refresh({ accessToken: "t" })).rejects.toThrow(
      NotImplementedError,
    );
    await expect(
      adapter.publish({
        caption: "hello",
        media: [],
        tokens: { accessToken: "t" },
        platformAccountId: "123",
      }),
    ).rejects.toThrow(NotImplementedError);
  });
});
