import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { decodeState, encodeState, newNonce } from "./oauth-state";

// Any 32 bytes, base64 — the signing path only needs a key to exist.
const TEST_KEY = Buffer.alloc(32, 7).toString("base64");

beforeEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = TEST_KEY;
});

afterEach(() => {
  delete process.env.TOKEN_ENCRYPTION_KEY;
  vi.useRealTimers();
});

describe("oauth state", () => {
  it("round-trips a payload when the nonce matches", () => {
    const nonce = newNonce();
    const state = encodeState({ n: nonce, w: "workspace-1" });
    const decoded = decodeState(state, nonce);
    expect(decoded?.w).toBe("workspace-1");
    expect(decoded?.n).toBe(nonce);
  });

  it("rejects a missing state or missing cookie", () => {
    const nonce = newNonce();
    const state = encodeState({ n: nonce, w: "w" });
    expect(decodeState(null, nonce)).toBeNull();
    expect(decodeState(state, undefined)).toBeNull();
  });

  it("rejects a wrong nonce — the CSRF double-submit check", () => {
    const state = encodeState({ n: newNonce(), w: "w" });
    expect(decodeState(state, newNonce())).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const nonce = newNonce();
    const state = encodeState({ n: nonce, w: "victim-workspace" });
    const [body, sig] = state.split(".");
    const forged = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(body, "base64url").toString()),
        w: "attacker-workspace",
      }),
    ).toString("base64url");
    expect(decodeState(`${forged}.${sig}`, nonce)).toBeNull();
  });

  it("rejects a state signed with a different key", () => {
    const nonce = newNonce();
    const state = encodeState({ n: nonce, w: "w" });
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    expect(decodeState(state, nonce)).toBeNull();
  });

  it("rejects a state older than its TTL", () => {
    vi.useFakeTimers();
    const nonce = newNonce();
    const state = encodeState({ n: nonce, w: "w" });
    vi.advanceTimersByTime(11 * 60 * 1000);
    expect(decodeState(state, nonce)).toBeNull();
  });

  it("accepts a state just inside the TTL", () => {
    vi.useFakeTimers();
    const nonce = newNonce();
    const state = encodeState({ n: nonce, w: "w" });
    vi.advanceTimersByTime(9 * 60 * 1000);
    expect(decodeState(state, nonce)?.w).toBe("w");
  });
});
