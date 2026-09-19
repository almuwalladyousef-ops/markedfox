// What is limited, how hard, and what the key looks like.
//
// Pure and dependency-free so the numbers can be read in one place and tested
// without a database. The enforcement lives in ./limit.ts; this file is the
// policy it enforces.
//
// The sizes are chosen against real use, not against a benchmark: a person who
// mistypes a password tries three or four times, not fifty, and a person who
// signs up does it once. Every limit here is far above what a human does and
// far below what a script does.

export type RateLimitPolicy = {
  /** Allowed attempts per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
  /** Shown to the person who hit it — plain, and never blames them. */
  message: string;
};

export const RATE_LIMITS = {
  /** Password guessing against one known address. */
  signInEmail: {
    limit: 8,
    windowSeconds: 300,
    message: "Too many sign-in attempts. Wait a moment and try again.",
  },
  /** The same, per source address: one attacker, many addresses. Looser,
   *  because a household or an office shares an IP and must not lock itself
   *  out because one person forgot a password. */
  signInIp: {
    limit: 40,
    windowSeconds: 300,
    message: "Too many sign-in attempts from this network. Try again shortly.",
  },
  /** Sign-up sends a confirmation email on our project's quota. */
  signUpIp: {
    limit: 10,
    windowSeconds: 3600,
    message: "Too many accounts created from this network. Try again later.",
  },
  /** Reset sends mail to any address the caller names — the cheapest way to
   *  burn a sending reputation, so this is the tightest limit here. */
  passwordResetEmail: {
    limit: 4,
    windowSeconds: 3600,
    message: "A reset link was already sent. Check your inbox, or try again later.",
  },
  passwordResetIp: {
    limit: 15,
    windowSeconds: 3600,
    message: "Too many reset requests from this network. Try again later.",
  },
  /** Resending a confirmation link mails an address the caller named, on the
   *  same project quota the signup itself spends — so it is limited like the
   *  password reset rather than like the signup. */
  confirmationResendEmail: {
    limit: 4,
    windowSeconds: 3600,
    message: "A confirmation link was already sent. Check your inbox, or try again later.",
  },
  confirmationResendIp: {
    limit: 12,
    windowSeconds: 3600,
    message: "Too many confirmation emails from this network. Try again later.",
  },
  /** Each presigned PUT is an object somebody can push bytes into, billed to
   *  our R2 account. Generous enough for a carousel of ten plus retries. */
  mediaUpload: {
    limit: 60,
    windowSeconds: 3600,
    message: "Too many uploads started. Wait a few minutes and try again.",
  },
} as const satisfies Record<string, RateLimitPolicy>;

export type RateLimitName = keyof typeof RATE_LIMITS;

/**
 * Build the key a policy counts against.
 *
 * Emails are lower-cased and trimmed so `A@b.com ` and `a@b.com` share one
 * bucket — otherwise changing the case of a letter buys a fresh allowance.
 * The subject is truncated because the column is a primary key and an
 * attacker controls the address they type.
 */
export function rateLimitKey(name: RateLimitName, subject: string): string {
  return `${name}:${subject.trim().toLowerCase().slice(0, 200)}`;
}

/**
 * The caller's address, from the proxy's header.
 *
 * Caddy sets X-Forwarded-For and the app is only reachable through it, so the
 * left-most entry is the real client. Returns null when there is no header to
 * trust — a caller we cannot identify is not limited by IP, only by the
 * per-email limits, which is the honest behaviour rather than lumping every
 * unknown caller into one shared bucket that then locks out real people.
 */
export function clientIpFrom(headers: {
  get(name: string): string | null;
}): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const real = headers.get("x-real-ip");
  return real ? real.trim().slice(0, 64) : null;
}
