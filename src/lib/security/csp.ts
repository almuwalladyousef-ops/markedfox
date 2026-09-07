/**
 * The Content-Security-Policy this app serves, as a pure function so it can be
 * read and tested without a running server.
 *
 * Three things decided here, each of which is easy to get wrong in a way that
 * only shows up in a browser months later:
 *
 * - **Scripts are nonce-only.** `'unsafe-inline'` is deliberately absent from
 *   `script-src`, which is the whole point of the header: an injected
 *   `<script>` cannot guess a per-request nonce. App Router streams its RSC
 *   payload through inline scripts, so this only works because Next reads the
 *   nonce out of the request's own CSP header and stamps it onto everything it
 *   emits. Every page here is already dynamically rendered (the root layout
 *   awaits `cookies()`), so the usual "nonces disable static generation" cost
 *   does not apply — the build reports exactly two static routes, both PNGs.
 * - **Styles keep `'unsafe-inline'`.** 26 components pass a `style={{…}}` prop,
 *   which the browser treats as an inline style attribute. A nonce cannot
 *   cover an attribute. Note the ordering rule in the spec: `'unsafe-inline'`
 *   is ignored the moment a nonce or hash appears in the SAME directive, so
 *   `style-src` must never gain one.
 * - **Images and media allow any https origin.** Avatars and thumbnails come
 *   from whatever CDN each platform happens to use that week — cdninstagram,
 *   fbcdn, ytimg, tiktokcdn, twimg — and an allow-list of those is a list that
 *   silently blanks somebody's profile picture when it changes. Images do not
 *   execute; scripts, which do, stay locked to this origin.
 */

export type CspOptions = {
  /** Per-request, unguessable. Must differ on every response. */
  nonce: string;
  /** Development needs `'unsafe-eval'` (React's error reconstruction) and a
   *  websocket for HMR. Neither is ever sent in production. */
  isDev?: boolean;
  /** NEXT_PUBLIC_SUPABASE_URL — the browser auth client talks straight to it. */
  supabaseUrl?: string;
  /** R2_PUBLIC_BASE_URL — where published media is read from. */
  r2PublicBaseUrl?: string;
  /** R2_ACCOUNT_ID — presigned PUTs go from the browser to this S3 endpoint,
   *  never through the droplet. Without it there is no upload to allow. */
  r2AccountId?: string;
};

/** The scheme+host of a configured URL, or null if it is absent or unparseable.
 *  A bad value must not be able to produce a broken directive. */
export function originOf(value: string | undefined | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/** The same origin expressed as a websocket scheme — Supabase Realtime. */
function websocketOriginOf(value: string | undefined | null): string | null {
  const origin = originOf(value);
  if (!origin) return null;
  return origin.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
}

function unique(values: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    if (value) seen.add(value);
  }
  return [...seen];
}

export function buildContentSecurityPolicy(options: CspOptions): string {
  const { nonce, isDev = false } = options;

  const supabase = originOf(options.supabaseUrl);
  const supabaseSocket = websocketOriginOf(options.supabaseUrl);
  const r2Public = originOf(options.r2PublicBaseUrl);
  // Scoped to our own account rather than *.r2.cloudflarestorage.com: the
  // wildcard would let a compromised page ship bytes to somebody else's bucket.
  const r2Api = options.r2AccountId
    ? `https://${options.r2AccountId}.r2.cloudflarestorage.com`
    : null;

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    // Matches the X-Frame-Options: SAMEORIGIN that Caddy already sends, rather
    // than contradicting it.
    "frame-ancestors": ["'self'"],
    // Stripe hosts checkout and the customer portal. The buttons that reach
    // them are Server Actions inside a <form>, and with JavaScript off the
    // redirect that follows the POST is a form navigation, which Chrome checks
    // against this directive.
    "form-action": [
      "'self'",
      "https://checkout.stripe.com",
      "https://billing.stripe.com",
    ],
    "script-src": unique([
      "'self'",
      `'nonce-${nonce}'`,
      // The in-browser trim/volume path compiles ffmpeg's WebAssembly.
      "'wasm-unsafe-eval'",
      isDev ? "'unsafe-eval'" : null,
    ]),
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "media-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    "connect-src": unique([
      "'self'",
      "blob:",
      "data:",
      supabase,
      supabaseSocket,
      r2Public,
      r2Api,
      isDev ? "ws:" : null,
    ]),
    // The ffmpeg worker is emitted same-origin under /_next/static. blob: is
    // kept because Safari does not implement worker-src and falls back to
    // child-src, and because a bundler is free to inline a worker.
    "worker-src": ["'self'", "blob:"],
    "child-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    // The research video page plays the outlier where you are reading about
    // it, rather than sending you to another tab and losing the analysis.
    //
    // Named hosts, never a bare `https:`. An iframe is a document with its own
    // script execution, so a wildcard here would undo most of the value of the
    // nonce above — unlike `img-src`, where the worst a wrong host can do is
    // show the wrong picture.
    //
    // youtube-nocookie is the privacy-preserving variant of the same player
    // and the one to prefer: it sets no tracking cookie until playback starts.
    // www.youtube.com is listed beside it because the nocookie player itself
    // redirects there for some videos.
    "frame-src": [
      "'self'",
      "https://www.youtube-nocookie.com",
      "https://www.youtube.com",
      "https://www.instagram.com",
    ],
  };

  const serialized = Object.entries(directives).map(
    ([name, values]) => `${name} ${values.join(" ")}`,
  );

  // Pointless over plain http, and it would break the dev server's own assets.
  if (!isDev) serialized.push("upgrade-insecure-requests");

  return serialized.join("; ");
}

/** A fresh 128-bit nonce. Unguessable is the entire security property, so this
 *  uses the platform CSPRNG and never Math.random. */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
