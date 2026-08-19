import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// Guarding the fetches the server makes to user-supplied media URLs.
//
// Most adapters hand a media URL to the platform and the PLATFORM fetches it
// (Instagram, Threads, TikTok, Facebook). YouTube and Snapchat are different:
// their APIs take bytes, so our server downloads the URL itself and streams
// it on. That makes the media URL a server-side request to an address the
// tenant chose — and without a check, "http://169.254.169.254/..." or
// "http://localhost:3000/api/internal/..." is a valid media URL. The
// response never comes back to the user (it goes to Google or Snap as a
// "video"), so this is blind SSRF; low severity, but free to close.
//
// Policy: our own storage is always allowed by prefix; anything else must
// resolve to a public unicast address, and redirects are followed by hand so
// every hop is checked the same way.
//
// Known gap, accepted: a hostname that resolves public here and private at
// connect time (DNS rebinding) slips through. Closing it means dialing the
// resolved IP ourselves, which undici's fetch does not expose cleanly; at
// launch scale the prefix allowlist covers every real upload anyway.

export class UnsafeMediaUrlError extends Error {
  constructor(url: string, reason: string) {
    super(`media URL refused (${reason}): ${url}`);
    this.name = "UnsafeMediaUrlError";
  }
}

function ipv4Parts(ip: string): number[] | null {
  const parts = ip.split(".").map(Number);
  return parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
    ? parts
    : null;
}

// Private, loopback, link-local, multicast, unspecified, CGNAT, and the cloud
// metadata range — none of which a public media host lives on.
export function isPrivateAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) {
    const p = ipv4Parts(ip);
    if (!p) return true;
    const [a, b] = p;
    return (
      a === 0 || // 0.0.0.0/8
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // 100.64/10 CGNAT
      (a === 169 && b === 254) || // link-local incl. 169.254.169.254
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && p[2] === 0) || // 192.0.0.0/24
      (a === 198 && (b === 18 || b === 19)) || // benchmarking
      a >= 224 // multicast + reserved + broadcast
    );
  }
  if (family === 6) {
    const lower = ip.toLowerCase();
    // IPv4-mapped (::ffff:a.b.c.d) — judge the embedded v4.
    const mapped = /^(?:0*:)*ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return isPrivateAddress(mapped[1]);
    const compact = lower.replace(/^\[|\]$/g, "");
    if (compact === "::" || compact === "::1") return true;
    const head = compact.split(":")[0] ?? "";
    const first = parseInt(head.padStart(4, "0"), 16);
    if (Number.isNaN(first)) return true;
    return (
      (first & 0xfe00) === 0xfc00 || // fc00::/7 unique local
      (first & 0xffc0) === 0xfe80 || // fe80::/10 link-local
      (first & 0xffc0) === 0xfec0 || // fec0::/10 site-local (deprecated)
      (first & 0xff00) === 0xff00 // ff00::/8 multicast
    );
  }
  return true; // not an IP literal at all
}

export type MediaFetchOptions = {
  /** URL prefix that is always trusted — our own storage. */
  trustedPrefix?: string;
  /** Injectable for tests. Defaults to dns.lookup with all addresses. */
  resolve?: (hostname: string) => Promise<string[]>;
};

async function defaultResolve(hostname: string): Promise<string[]> {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((r) => r.address);
}

// Throws UnsafeMediaUrlError unless the URL is safe to fetch from the server.
export async function assertSafeMediaUrl(
  raw: string,
  options: MediaFetchOptions = {},
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeMediaUrlError(raw, "not a URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new UnsafeMediaUrlError(raw, "not http(s)");
  }
  if (url.username || url.password) {
    throw new UnsafeMediaUrlError(raw, "credentials in URL");
  }

  const prefix = options.trustedPrefix?.replace(/\/+$/, "");
  if (prefix && (raw === prefix || raw.startsWith(`${prefix}/`))) return url;

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new UnsafeMediaUrlError(raw, "localhost");
  }

  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new UnsafeMediaUrlError(raw, "private address");
    return url;
  }

  let addresses: string[];
  try {
    addresses = await (options.resolve ?? defaultResolve)(host);
  } catch {
    throw new UnsafeMediaUrlError(raw, "hostname does not resolve");
  }
  if (addresses.length === 0) throw new UnsafeMediaUrlError(raw, "hostname does not resolve");
  if (addresses.some(isPrivateAddress)) {
    throw new UnsafeMediaUrlError(raw, "resolves to a private address");
  }
  return url;
}

const MAX_REDIRECTS = 3;

// fetch() for user-supplied media: every hop of the redirect chain passes
// assertSafeMediaUrl. `init.signal` and headers are carried to each hop.
export async function fetchMedia(
  raw: string,
  init: RequestInit = {},
  options: MediaFetchOptions = {},
): Promise<Response> {
  let current = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = await assertSafeMediaUrl(current, options);
    const response = await fetch(url, { ...init, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;

    const location = response.headers.get("location");
    // Drain the redirect body so the connection is released.
    await response.body?.cancel().catch(() => undefined);
    if (!location) return response;
    current = new URL(location, url).toString();
  }
  throw new UnsafeMediaUrlError(raw, `more than ${MAX_REDIRECTS} redirects`);
}
