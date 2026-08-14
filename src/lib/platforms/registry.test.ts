import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PlatformNotRegisteredError } from "./errors";
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

  describe("instagram authorize URL", () => {
    beforeEach(() => {
      process.env.META_APP_ID = "test-app-id";
    });
    afterEach(() => {
      delete process.env.META_APP_ID;
    });

    it("builds a Facebook OAuth dialog URL carrying state and scopes", () => {
      const url = new URL(
        getPlatform("instagram").getAuthorizeUrl({
          redirectUri: "https://markedfox.com/api/connect/instagram/callback",
          state: "signed-state",
        }),
      );
      expect(url.hostname).toBe("www.facebook.com");
      expect(url.pathname).toMatch(/^\/v\d+\.\d+\/dialog\/oauth$/);
      expect(url.searchParams.get("client_id")).toBe("test-app-id");
      expect(url.searchParams.get("state")).toBe("signed-state");
      expect(url.searchParams.get("response_type")).toBe("code");
      expect(url.searchParams.get("redirect_uri")).toBe(
        "https://markedfox.com/api/connect/instagram/callback",
      );
      const scopes = url.searchParams.get("scope")?.split(",") ?? [];
      expect(scopes).toContain("instagram_basic");
      expect(scopes).toContain("instagram_content_publish");
      // Phase 4 requests this one alongside the DM engine screencast — asking
      // for the hardest permission early only collects rejections.
      expect(scopes).not.toContain("instagram_manage_messages");
    });

    it("fails loudly when META_APP_ID is unset rather than emitting a broken URL", () => {
      delete process.env.META_APP_ID;
      expect(() =>
        getPlatform("instagram").getAuthorizeUrl({
          redirectUri: "https://markedfox.com/cb",
          state: "s",
        }),
      ).toThrow(/META_APP_ID/);
    });
  });
});
