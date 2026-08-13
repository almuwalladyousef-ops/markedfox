import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM envelope for OAuth tokens at rest. Envelope format:
//   v1.<iv>.<ciphertext>.<tag>   (all base64url)
// The version prefix exists so a future key or algorithm rotation can decrypt
// old rows by branching on the prefix.
//
// There is deliberately no fallback key: a missing or malformed
// TOKEN_ENCRYPTION_KEY throws, it never silently encrypts with a dev secret.

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const VERSION = "v1";

export class TokenCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenCryptoError";
  }
}

function loadKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new TokenCryptoError(
      "TOKEN_ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    throw new TokenCryptoError(
      `TOKEN_ENCRYPTION_KEY must be base64 of exactly ${KEY_BYTES} bytes ` +
        `(got ${key.length}). Generate one with: openssl rand -base64 32`,
    );
  }
  return key;
}

export function encryptToken(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

export function decryptToken(envelope: string): string {
  const key = loadKey();
  const parts = envelope.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new TokenCryptoError(
      `Malformed token envelope: expected "${VERSION}.<iv>.<ciphertext>.<tag>"`,
    );
  }
  const [, ivPart, ciphertextPart, tagPart] = parts;
  const iv = Buffer.from(ivPart, "base64url");
  const ciphertext = Buffer.from(ciphertextPart, "base64url");
  const tag = Buffer.from(tagPart, "base64url");
  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new TokenCryptoError(
      "Token decryption failed: wrong key or tampered ciphertext",
    );
  }
}
