import { createHash, createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getPlatform } from "./registry";

// The four adapters added 2026-08-19, tested where they are pure: authorize
// URLs, PKCE derivation, and the declared rules the composer renders. Their
// publish paths need live credentials (or in Snapchat's case an allowlist)
// and are exercised by the publish smoke script once those exist.

describe("x adapter", () => {
  beforeEach(() => {
    process.env.X_CLIENT_ID = "x-client-id";
    process.env.X_CLIENT_SECRET = "x-client-secret";
  });
  afterEach(() => {
    delete process.env.X_CLIENT_ID;
    delete process.env.X_CLIENT_SECRET;
  });

  it("builds the authorize URL on x.com with S256 PKCE and space-separated scopes", () => {
    const url = new URL(
      getPlatform("x").getAuthorizeUrl({
        redirectUri: "https://markedfox.com/api/connect/x/callback",
        state: "signed-state",
      }),
    );
    expect(url.hostname).toBe("x.com");
    expect(url.pathname).toBe("/i/oauth2/authorize");
    expect(url.searchParams.get("client_id")).toBe("x-client-id");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toBe(
      "tweet.read tweet.write users.read offline.access",
    );
    // offline.access is what makes refresh tokens exist at all.
    expect(url.searchParams.get("scope")).toContain("offline.access");
  });

  it("derives the PKCE challenge from the state and the client secret", () => {
    // Reimplement the derivation: both legs must land on the same verifier
    // without storing anything, and the secret must be in the mix — state
    // rides the callback URL next to the code.
    const state = "some-signed-state";
    const url = new URL(
      getPlatform("x").getAuthorizeUrl({
        redirectUri: "https://markedfox.com/cb",
        state,
      }),
    );
    const verifier = createHmac("sha256", "x-client-secret")
      .update(state)
      .digest("hex");
    const expected = createHash("sha256").update(verifier).digest("base64url");
    expect(url.searchParams.get("code_challenge")).toBe(expected);

    // A different state must produce a different challenge.
    const other = new URL(
      getPlatform("x").getAuthorizeUrl({
        redirectUri: "https://markedfox.com/cb",
        state: "different-state",
      }),
    );
    expect(other.searchParams.get("code_challenge")).not.toBe(expected);
  });

  it("is caption-only: 280 chars, no media capabilities", () => {
    const adapter = getPlatform("x");
    expect(adapter.rules.captionMaxChars).toBe(280);
    expect(adapter.capabilities.text).toBe(true);
    expect(adapter.capabilities.image).toBe(false);
    expect(adapter.capabilities.video).toBe(false);
  });

  it("refuses to publish media even if validation is bypassed", async () => {
    await expect(
      getPlatform("x").publish({
        caption: "hello",
        media: [{ url: "https://example.com/a.jpg", type: "image" }],
        tokens: { accessToken: "t" },
        platformAccountId: "1",
      }),
    ).rejects.toThrow(/caption-only/);
  });
});

describe("tiktok adapter", () => {
  beforeEach(() => {
    process.env.TIKTOK_CLIENT_KEY = "tt-key";
    process.env.TIKTOK_CLIENT_SECRET = "tt-secret";
  });
  afterEach(() => {
    delete process.env.TIKTOK_CLIENT_KEY;
    delete process.env.TIKTOK_CLIENT_SECRET;
  });

  it("authorizes with client_key and comma-separated scopes — TikTok's dialect", () => {
    const url = new URL(
      getPlatform("tiktok").getAuthorizeUrl({
        redirectUri: "https://markedfox.com/api/connect/tiktok/callback",
        state: "s",
      }),
    );
    expect(url.hostname).toBe("www.tiktok.com");
    expect(url.searchParams.get("client_key")).toBe("tt-key");
    expect(url.searchParams.get("client_id")).toBeNull();
    expect(url.searchParams.get("scope")).toBe(
      // The read scopes (profile, stats, video.list) ride along with the
      // publish one: the home screen needs the account's own videos and
      // follower count.
      //
      // video.upload is deliberately absent. It is the inbox-draft half of
      // Content Posting and this adapter has never called it, which is the
      // "Scopes mismatch" TikTok refused the 2026-09-08 submission for.
      "user.info.basic,user.info.profile,user.info.stats,video.list," +
        "video.publish",
    );
  });

  it("declares single-video-or-photos rules", () => {
    const adapter = getPlatform("tiktok");
    expect(adapter.rules.maxVideos).toBe(1);
    expect(adapter.rules.mediaMax).toBe(35);
    expect(adapter.rules.mixedMediaAllowed).toBe(false);
    expect(adapter.capabilities.text).toBe(false);
  });
});

describe("youtube adapter", () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "g-id";
    process.env.GOOGLE_CLIENT_SECRET = "g-secret";
  });
  afterEach(() => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
  });

  it("requests offline access with forced consent so refresh tokens always arrive", () => {
    const url = new URL(
      getPlatform("youtube").getAuthorizeUrl({
        redirectUri: "https://markedfox.com/api/connect/youtube/callback",
        state: "s",
      }),
    );
    expect(url.hostname).toBe("accounts.google.com");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    const scope = url.searchParams.get("scope") ?? "";
    // upload alone cannot read channel identity — readonly must ride along.
    expect(scope).toContain("youtube.upload");
    expect(scope).toContain("youtube.readonly");
  });

  it("is video-only, one per post", () => {
    const adapter = getPlatform("youtube");
    expect(adapter.capabilities.video).toBe(true);
    expect(adapter.capabilities.image).toBe(false);
    expect(adapter.capabilities.text).toBe(false);
    expect(adapter.rules.mediaMax).toBe(1);
  });

  it("refuses a non-video publish before touching the network", async () => {
    await expect(
      getPlatform("youtube").publish({
        caption: "hello",
        media: [{ url: "https://example.com/a.jpg", type: "image" }],
        tokens: { accessToken: "t" },
        platformAccountId: "chan",
      }),
    ).rejects.toThrow(/exactly one video/);
  });
});

describe("snapchat adapter", () => {
  beforeEach(() => {
    process.env.SNAPCHAT_CLIENT_ID = "snap-id";
    process.env.SNAPCHAT_CLIENT_SECRET = "snap-secret";
  });
  afterEach(() => {
    delete process.env.SNAPCHAT_CLIENT_ID;
    delete process.env.SNAPCHAT_CLIENT_SECRET;
  });

  it("authorizes on accounts.snapchat.com with the profile scope", () => {
    const url = new URL(
      getPlatform("snapchat").getAuthorizeUrl({
        redirectUri: "https://markedfox.com/api/connect/snapchat/callback",
        state: "s",
      }),
    );
    expect(url.hostname).toBe("accounts.snapchat.com");
    expect(url.searchParams.get("client_id")).toBe("snap-id");
    expect(url.searchParams.get("scope")).toBe("snapchat-profile-api");
  });

  it("is a single vertical video with a 160-char description", () => {
    const adapter = getPlatform("snapchat");
    expect(adapter.rules.captionMaxChars).toBe(160);
    expect(adapter.rules.mediaMax).toBe(1);
    expect(adapter.capabilities.image).toBe(false);
    expect(adapter.capabilities.video).toBe(true);
  });

  it("refuses a non-video publish before touching the network", async () => {
    await expect(
      getPlatform("snapchat").publish({
        caption: "hello",
        media: [],
        tokens: { accessToken: "t" },
        platformAccountId: "profile",
      }),
    ).rejects.toThrow(/exactly one vertical video/);
  });
});
