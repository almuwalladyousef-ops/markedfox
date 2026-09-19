// Plain wording for the errors Supabase Auth hands back.
//
// This exists because returning `error.message` straight to a form is wrong
// twice over. It is the provider's wording, written for a developer reading a
// log rather than for the person on the page: "email rate limit exceeded" is
// the literal line that stopped two real registrations, and it names neither
// what happened nor what to do next. And it is not ours to show — GoTrue may
// reword or extend it at any time, and some of its messages describe
// internals the caller has no business reading.
//
// Pure and dependency-free so the mapping can be tested without a network.

export type AuthErrorLike = {
  message?: string | null;
  code?: string | null;
  status?: number | null;
};

/**
 * The project could not send the email, rather than the caller doing anything
 * wrong.
 *
 * Supabase's built-in email service is a testing convenience capped at a
 * couple of messages an hour FOR THE WHOLE PROJECT, so two people signing up
 * minutes apart is enough to hit it. That makes this the one failure here
 * worth naming separately: the account was not created, the person did
 * nothing wrong, and trying the same thing again in a minute is the fix.
 */
export function isEmailSendRateLimit(error: AuthErrorLike | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "over_email_send_rate_limit") return true;
  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes("email rate limit exceeded") ||
    message.includes("rate limit exceeded for email")
  );
}

// Deliberately says nothing about what was or was not created: the same line
// answers a signup, a resend and an email change, and only the caller knows
// which. signUp adds "No account was created" itself.
export const EMAIL_SEND_RATE_LIMIT =
  "We could not send that email just now — too many have gone out in the " +
  "last hour. Wait a few minutes and try again.";

// Keyed by GoTrue's stable `code`. The message is checked only where a code
// is missing, because older releases send one without the other.
const BY_CODE: Record<string, string> = {
  over_request_rate_limit:
    "Too many attempts just now. Wait a minute and try again.",
  email_address_invalid: "That email address does not look right.",
  email_address_not_authorized:
    "We cannot send email to that address. Try a different one.",
  email_exists: "That email address is already in use.",
  weak_password:
    "That password is too easy to guess. Try a longer one with a mix of characters.",
  same_password: "That is already your password. Choose a different one.",
  signup_disabled: "New accounts are closed right now.",
  email_provider_disabled: "Signing up with an email address is turned off.",
  session_not_found: "Your sign-in expired. Sign in again and retry.",
  reauthentication_needed: "Sign in again before changing this.",
  over_email_send_rate_limit: EMAIL_SEND_RATE_LIMIT,
};

const FALLBACK = "Something went wrong on our side. Try again in a moment.";

/**
 * The line to put on the form.
 *
 * Anything unrecognised becomes the generic fallback rather than the raw
 * message, so a new GoTrue error can never surface its own wording here
 * untranslated. Pass the raw error to `logAuthError` at the call site — the
 * detail belongs in the server log, not on the screen.
 */
export function authErrorMessage(error: AuthErrorLike | null | undefined): string {
  if (!error) return FALLBACK;
  if (isEmailSendRateLimit(error)) return EMAIL_SEND_RATE_LIMIT;

  const code = error.code ?? "";
  if (code && BY_CODE[code]) return BY_CODE[code];

  // No code, or one we do not know: a 429 is still a rate limit and saying so
  // is more useful than the fallback.
  if (error.status === 429) return BY_CODE.over_request_rate_limit;

  return FALLBACK;
}

/** The raw detail, server-side only, so a fallback on screen is still
 *  diagnosable from the log. */
export function logAuthError(context: string, error: AuthErrorLike): void {
  console.error(
    `auth: ${context} failed`,
    JSON.stringify({
      code: error.code ?? null,
      status: error.status ?? null,
      message: error.message ?? null,
    }),
  );
}
