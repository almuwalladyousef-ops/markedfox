import { describe, expect, it } from "vitest";

import { parseInstagramInput } from "./instagram";
import {
  getResearchProvider,
  isResearchProviderConfigured,
  listResearchProviders,
} from "./index";
import { parseXInput } from "./x";
import { parseIsoDuration } from "./youtube";

describe("the registry", () => {
  it("has a provider for every platform it lists", () => {
    for (const provider of listResearchProviders()) {
      expect(getResearchProvider(provider.platform)).toBe(provider);
    }
  });

  it("does not offer Snapchat, which has no content API at all", () => {
    const ids = listResearchProviders().map((p) => p.platform);
    expect(ids).not.toContain("snapchat");
  });

  it("puts YouTube first, because it is the only one that reads any channel without a connection", () => {
    const first = listResearchProviders()[0];
    expect(first.platform).toBe("youtube");
    expect(first.capabilities.discoverAnyChannel).toBe(true);
    expect(first.capabilities.requiresConnection).toBe(false);
  });

  it("marks TikTok as own-content-only rather than pretending it can read competitors", () => {
    const tiktok = getResearchProvider("tiktok");
    expect(tiktok.capabilities.ownContentOnly).toBe(true);
    expect(tiktok.capabilities.discoverAnyChannel).toBe(false);
  });

  it("marks X reads as metered, because they cost money each", () => {
    expect(getResearchProvider("x").capabilities.meteredReads).toBe(true);
  });

  it("treats a connection-backed provider as configured with no env", () => {
    const instagram = getResearchProvider("instagram");
    expect(instagram.requiredEnv).toHaveLength(0);
    expect(isResearchProviderConfigured(instagram, {})).toBe(true);
  });

  it("treats a key-backed provider as unconfigured until its key exists", () => {
    const youtube = getResearchProvider("youtube");
    expect(isResearchProviderConfigured(youtube, {})).toBe(false);
    expect(
      isResearchProviderConfigured(youtube, {
        YOUTUBE_API_KEY: "k",
      }),
    ).toBe(true);
  });
});

describe("parseIsoDuration", () => {
  it("reads minutes and seconds", () => {
    expect(parseIsoDuration("PT4M13S")).toBe(253);
  });

  it("reads hours", () => {
    expect(parseIsoDuration("PT1H2M3S")).toBe(3723);
  });

  it("reads a bare seconds duration (a Short)", () => {
    expect(parseIsoDuration("PT45S")).toBe(45);
  });

  it("is null for nothing or nonsense", () => {
    expect(parseIsoDuration(undefined)).toBeNull();
    expect(parseIsoDuration("banana")).toBeNull();
  });
});

describe("input parsing", () => {
  it("pulls a username out of an Instagram URL", () => {
    expect(parseInstagramInput("https://www.instagram.com/nike/")).toBe("nike");
  });

  it("strips the @ from an Instagram handle", () => {
    expect(parseInstagramInput("@nike")).toBe("nike");
  });

  it("pulls a handle out of an X post URL", () => {
    expect(parseXInput("https://x.com/naval/status/12345")).toBe("naval");
  });

  it("still handles twitter.com links", () => {
    expect(parseXInput("https://twitter.com/naval")).toBe("naval");
  });
});
