import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MAX_MEDIA_ITEMS } from "@/lib/publish/request";

import { PlatformNotRegisteredError } from "./errors";
import { getPlatform, listRegisteredPlatforms } from "./registry";
import { PLATFORMS } from "./types";

describe("platform registry", () => {
  it("never declares a media cap the API's shape check would refuse first", () => {
    // The composer validates with rules.mediaMax; POST /api/posts refuses
    // bodies over MAX_MEDIA_ITEMS before any adapter rule runs. If an
    // adapter allows more than the API accepts, a post the composer calls
    // valid is rejected after submit — the exact failure mode the rules
    // exist to prevent.
    for (const adapter of listRegisteredPlatforms()) {
      expect(adapter.rules.mediaMax, adapter.id).toBeLessThanOrEqual(MAX_MEDIA_ITEMS);
    }
  });

  it("exposes all 9 known platforms in the union", () => {
    expect(PLATFORMS).toEqual([
      "instagram",
      "x",
      "threads",
      "facebook",
      "tiktok",
      "youtube",
      "snapchat",
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
    expect(() => getPlatform("linkedin")).toThrow(PlatformNotRegisteredError);
    expect(() => getPlatform("pinterest")).toThrow(PlatformNotRegisteredError);
  });

  it("gives Facebook and Threads the capabilities Instagram lacks", () => {
    // Instagram cannot post text alone; both of these can, and the composer
    // reads exactly this to decide what to allow.
    expect(getPlatform("instagram").capabilities.text).toBe(false);
    expect(getPlatform("facebook").capabilities.text).toBe(true);
    expect(getPlatform("threads").capabilities.text).toBe(true);
  });

  it("points Threads at its own API, not the Facebook graph", () => {
    // Threads is a separate API with separate credentials — a regression here
    // would silently send Threads traffic to graph.facebook.com.
    process.env.THREADS_APP_ID = "threads-app-id";
    const url = new URL(
      getPlatform("threads").getAuthorizeUrl({
        redirectUri: "https://markedfox.com/api/connect/threads/callback",
        state: "s",
      }),
    );
    expect(url.hostname).toBe("threads.net");
    expect(url.searchParams.get("client_id")).toBe("threads-app-id");
    expect(url.searchParams.get("scope")).toContain("threads_content_publish");
    delete process.env.THREADS_APP_ID;
  });

  it("lists only registered adapters", () => {
    const ids = listRegisteredPlatforms().map((a) => a.id);
    expect(ids).toEqual([
      "instagram",
      "x",
      "facebook",
      "threads",
      "tiktok",
      "youtube",
      "snapchat",
    ]);
  });

  it("declares a refresh policy and required env on every adapter", () => {
    for (const adapter of listRegisteredPlatforms()) {
      expect(["sweep", "on-use"]).toContain(adapter.refreshPolicy);
      expect(adapter.requiredEnv.length).toBeGreaterThan(0);
    }
    // Short-lived-access-token platforms must never be swept minutely.
    expect(getPlatform("x").refreshPolicy).toBe("on-use");
    expect(getPlatform("youtube").refreshPolicy).toBe("on-use");
    expect(getPlatform("tiktok").refreshPolicy).toBe("on-use");
    expect(getPlatform("snapchat").refreshPolicy).toBe("on-use");
    // The 60-day-token platforms are exactly what the sweep exists for.
    expect(getPlatform("threads").refreshPolicy).toBe("sweep");
    expect(getPlatform("instagram").refreshPolicy).toBe("sweep");
    expect(getPlatform("facebook").refreshPolicy).toBe("sweep");
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
