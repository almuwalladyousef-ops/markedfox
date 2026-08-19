import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PlatformApiError, PlatformAuthError } from "./errors";
import { getPlatform } from "./registry";

// OAuth token endpoints do not say 401 when a refresh token is dead — they
// say 400 with an OAuth error code. X answers `invalid_request` ("Value
// passed for the token was invalid."), Snap and Google `invalid_grant`.
// Classifying those as generic API errors would leave a revoked connection
// `active` and retrying forever, instead of asking for a reconnect. These
// tests pin the mapping, and — just as important — that a 400 from an
// ordinary API call is still NOT an auth error.

const realFetch = globalThis.fetch;

function answer(status: number, body: unknown) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("x token endpoint", () => {
  beforeEach(() => {
    process.env.X_CLIENT_ID = "id";
    process.env.X_CLIENT_SECRET = "secret";
  });
  afterEach(() => {
    delete process.env.X_CLIENT_ID;
    delete process.env.X_CLIENT_SECRET;
  });

  it("treats 400 invalid_request from a refresh as a dead grant", async () => {
    answer(400, {
      error: "invalid_request",
      error_description: "Value passed for the token was invalid.",
    });
    const err = await getPlatform("x")
      .refresh({ accessToken: "a", refreshToken: "dead" })
      .catch((e) => e);
    expect(err).toBeInstanceOf(PlatformAuthError);
    expect(err.message).toContain("token was invalid");
  });

  it("treats 400 invalid_grant / unauthorized_client the same way", async () => {
    for (const code of ["invalid_grant", "unauthorized_client"]) {
      answer(400, { error: code });
      const err = await getPlatform("x")
        .refresh({ accessToken: "a", refreshToken: "dead" })
        .catch((e) => e);
      expect(err).toBeInstanceOf(PlatformAuthError);
    }
  });

  it("still reports a 400 from POST /2/tweets as an API error, not an auth error", async () => {
    answer(400, { title: "Invalid Request", detail: "text too long" });
    const err = await getPlatform("x")
      .publish({ caption: "x", media: [], tokens: { accessToken: "a" }, platformAccountId: "1" })
      .catch((e) => e);
    expect(err).toBeInstanceOf(PlatformApiError);
    expect(err.retryable).toBe(false);
  });

  it("keeps a 5xx from the token endpoint retryable and non-fatal to the grant", async () => {
    answer(503, {});
    const err = await getPlatform("x")
      .refresh({ accessToken: "a", refreshToken: "fine" })
      .catch((e) => e);
    expect(err).toBeInstanceOf(PlatformApiError);
    expect(err.retryable).toBe(true);
  });
});

describe("snapchat token endpoint", () => {
  beforeEach(() => {
    process.env.SNAPCHAT_CLIENT_ID = "id";
    process.env.SNAPCHAT_CLIENT_SECRET = "secret";
  });
  afterEach(() => {
    delete process.env.SNAPCHAT_CLIENT_ID;
    delete process.env.SNAPCHAT_CLIENT_SECRET;
  });

  it("treats 400 invalid_grant from a refresh as a dead grant", async () => {
    answer(400, { error: "invalid_grant", error_description: "refresh token revoked" });
    const err = await getPlatform("snapchat")
      .refresh({ accessToken: "a", refreshToken: "dead" })
      .catch((e) => e);
    expect(err).toBeInstanceOf(PlatformAuthError);
  });

  it("does not promote an ordinary 400 to an auth error", async () => {
    answer(400, { error: "invalid_grant" }); // same body, but not the token endpoint
    const err = await getPlatform("snapchat")
      .publish({
        caption: "c",
        media: [{ url: "https://storage.example/v.mp4", type: "video" }],
        tokens: { accessToken: "a" },
        platformAccountId: "p",
      })
      .catch((e) => e);
    // The first network call in publish is the storage fetch, which the stub
    // answers with a 400 → "could not fetch media" API error, never auth.
    expect(err).toBeInstanceOf(PlatformApiError);
  });
});

describe("tiktok and youtube token endpoints (already mapped, pinned here)", () => {
  beforeEach(() => {
    process.env.TIKTOK_CLIENT_KEY = "k";
    process.env.TIKTOK_CLIENT_SECRET = "s";
    process.env.GOOGLE_CLIENT_ID = "g";
    process.env.GOOGLE_CLIENT_SECRET = "s";
  });
  afterEach(() => {
    delete process.env.TIKTOK_CLIENT_KEY;
    delete process.env.TIKTOK_CLIENT_SECRET;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
  });

  it("tiktok: 400 invalid_grant is a dead grant", async () => {
    answer(400, { error: "invalid_grant", error_description: "Refresh token is invalid" });
    const err = await getPlatform("tiktok")
      .refresh({ accessToken: "a", refreshToken: "dead" })
      .catch((e) => e);
    expect(err).toBeInstanceOf(PlatformAuthError);
  });

  it("youtube: 400 invalid_grant is a dead grant", async () => {
    answer(400, { error: "invalid_grant", error_description: "Token has been expired or revoked." });
    const err = await getPlatform("youtube")
      .refresh({ accessToken: "a", refreshToken: "dead" })
      .catch((e) => e);
    expect(err).toBeInstanceOf(PlatformAuthError);
  });
});
