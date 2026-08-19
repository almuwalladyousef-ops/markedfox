import { createHmac, timingSafeEqual } from "node:crypto";

// Meta's signed_request: `<base64url(hmac-sha256(payload))>.<base64url(json)>`,
// signed with the app secret. Used by the deauthorize and data-deletion
// callbacks, both of which are public endpoints — a forged request must not
// be able to delete anything, so verification is a constant-time compare of
// the full digest.

export type MetaApp = "meta" | "threads";

function b64url(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function parseSignedRequest(
  signed: string,
  secret: string,
): Record<string, unknown> | null {
  const [sigPart, payloadPart] = signed.split(".", 2);
  if (!sigPart || !payloadPart) return null;

  const expected = createHmac("sha256", secret).update(payloadPart).digest();
  const given = b64url(sigPart);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(b64url(payloadPart).toString("utf8"));
    return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// The Facebook/Instagram app and the Threads use case sign with DIFFERENT
// secrets (META_APP_SECRET vs THREADS_APP_SECRET), and both point their
// callbacks at the same two URLs. Try each configured secret; the one that
// verifies tells us which product the request came from, and therefore how
// to match the user id to our rows.
export function verifyMetaSignedRequest(
  signed: string,
  secrets: { meta?: string; threads?: string } = {
    meta: process.env.META_APP_SECRET,
    threads: process.env.THREADS_APP_SECRET,
  },
): { payload: Record<string, unknown>; app: MetaApp } | null {
  for (const app of ["meta", "threads"] as const) {
    const secret = secrets[app];
    if (!secret) continue;
    const payload = parseSignedRequest(signed, secret);
    if (payload) return { payload, app };
  }
  return null;
}
