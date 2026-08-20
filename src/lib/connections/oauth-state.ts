import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Signed OAuth `state` parameter. Two jobs: CSRF (the callback only accepts a
// state this server minted, bound to a nonce cookie set at /start) and routing
// (which workspace the connection belongs to) without a database round trip.
//
// Format: base64url(payload-json) + "." + base64url(hmac-sha256(payload))
// Keyed with TOKEN_ENCRYPTION_KEY — already required, secret, and 32 bytes.

const STATE_TTL_MS = 10 * 60 * 1000;

export type OAuthStatePayload = {
  /** Nonce, echoed in an httpOnly cookie for the double-submit check. */
  n: string;
  /** Workspace the connection will be stored under. */
  w: string;
  /** Optional feature sets requested in leg 1 ("messaging"), so leg 2 knows
   *  which scopes were asked for and where to land afterwards. */
  f?: string[];
  /** Mint time, for expiry. */
  t: number;
};

function key(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY is not set — OAuth state cannot be signed.",
    );
  }
  return Buffer.from(raw, "base64");
}

function sign(payload: string): string {
  return createHmac("sha256", key()).update(payload).digest("base64url");
}

export function newNonce(): string {
  return randomBytes(16).toString("base64url");
}

export function encodeState(payload: Omit<OAuthStatePayload, "t">): string {
  const body = Buffer.from(
    JSON.stringify({ ...payload, t: Date.now() } satisfies OAuthStatePayload),
  ).toString("base64url");
  return `${body}.${sign(body)}`;
}

// Returns the payload only when the signature verifies, the state is fresh,
// and the nonce matches the cookie. Everything else is null — the callback
// treats any null as a hostile or stale request and refuses.
export function decodeState(
  state: string | null,
  cookieNonce: string | undefined,
): OAuthStatePayload | null {
  if (!state || !cookieNonce) return null;
  const dot = state.lastIndexOf(".");
  if (dot <= 0) return null;

  const body = state.slice(0, dot);
  const givenSig = state.slice(dot + 1);
  const wantSig = sign(body);
  const a = Buffer.from(givenSig);
  const b = Buffer.from(wantSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (typeof payload.n !== "string" || typeof payload.w !== "string") {
    return null;
  }
  if (typeof payload.t !== "number" || Date.now() - payload.t > STATE_TTL_MS) {
    return null;
  }

  const nonceA = Buffer.from(payload.n);
  const nonceB = Buffer.from(cookieNonce);
  if (nonceA.length !== nonceB.length || !timingSafeEqual(nonceA, nonceB)) {
    return null;
  }

  return payload;
}
