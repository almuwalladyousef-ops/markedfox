/**
 * Which HTTP methods this application answers at all.
 *
 * TRACE used to come back `500 Internal Server Error` — a scanner reads that as
 * "the server broke", and it is one of the few responses that says something
 * about us rather than about the request. The cause is upstream of this file:
 * Next converts the Node request into a WHATWG Request before middleware runs,
 * and that constructor throws on TRACE, TRACK and CONNECT. Those three are
 * therefore refused by Caddy (deploy/Caddyfile), which is the only thing bound
 * to a public port.
 *
 * This list is what src/proxy.ts uses for everything that DOES reach the
 * framework, and it is an allow-list rather than a block-list of those three:
 * an invented method is exactly as unhandled, and would fail the same way.
 */
export const ALLOWED_METHODS = [
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
] as const;

export type AllowedMethod = (typeof ALLOWED_METHODS)[number];

/** The value of the `Allow` header a 405 must carry (RFC 9110 §15.5.6). */
export const ALLOW_HEADER = ALLOWED_METHODS.join(", ");

export function isAllowedMethod(method: string | undefined | null): boolean {
  if (!method) return false;
  return (ALLOWED_METHODS as readonly string[]).includes(method.toUpperCase());
}
