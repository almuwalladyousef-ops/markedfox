import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import { decryptToken, encryptToken, TokenCryptoError } from "./crypto";

const VALID_KEY = randomBytes(32).toString("base64");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("token crypto", () => {
  it("round-trips a token", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", VALID_KEY);
    const plaintext = "IGQVJ-example-oauth-token-value";
    expect(decryptToken(encryptToken(plaintext))).toBe(plaintext);
  });

  it("produces a different envelope for the same plaintext (fresh IV)", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", VALID_KEY);
    expect(encryptToken("same")).not.toBe(encryptToken("same"));
  });

  it("throws on tampered ciphertext", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", VALID_KEY);
    const envelope = encryptToken("secret");
    const parts = envelope.split(".");
    const bytes = Buffer.from(parts[2], "base64url");
    bytes[0] ^= 0xff;
    parts[2] = bytes.toString("base64url");
    expect(() => decryptToken(parts.join("."))).toThrow(TokenCryptoError);
  });

  it("throws on a malformed envelope", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", VALID_KEY);
    expect(() => decryptToken("not-an-envelope")).toThrow(TokenCryptoError);
    expect(() => decryptToken("v2.a.b.c")).toThrow(TokenCryptoError);
  });

  it("fails loudly when the key is missing — no dev fallback", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "");
    expect(() => encryptToken("secret")).toThrow(TokenCryptoError);
    expect(() => decryptToken("v1.a.b.c")).toThrow(TokenCryptoError);
  });

  it("fails loudly when the key is the wrong length", () => {
    vi.stubEnv(
      "TOKEN_ENCRYPTION_KEY",
      randomBytes(16).toString("base64"),
    );
    expect(() => encryptToken("secret")).toThrow(TokenCryptoError);
  });

  it("cannot decrypt with a different key", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", VALID_KEY);
    const envelope = encryptToken("secret");
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
    expect(() => decryptToken(envelope)).toThrow(TokenCryptoError);
  });
});
