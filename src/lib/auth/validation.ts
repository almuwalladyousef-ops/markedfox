// Pure input validation for the auth forms. No I/O, no framework imports, so
// the rules are testable without a database or a request.
//
// These run server-side inside the actions. The browser's own `required` and
// `type="email"` attributes are a convenience for the user, never the check
// that matters — a Server Action is a public POST endpoint.

export const MIN_PASSWORD_LENGTH = 8;

// Supabase's own default floor is 6. Eight is a product decision: this account
// holds OAuth tokens for other people's social accounts, so it is worth more
// than a typical login.
export type FieldErrors = Record<string, string>;

export type Validated<T> =
  | { ok: true; value: T }
  | { ok: false; errors: FieldErrors };

// Deliberately loose. Real address validity is proven by the confirmation
// email, not by a regex — the only job here is to reject obvious typos before
// spending a network call.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(raw: FormDataEntryValue | null): Validated<string> {
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";

  if (!email) {
    return { ok: false, errors: { email: "Enter your email address." } };
  }
  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, errors: { email: "That does not look like an email address." } };
  }
  // Supabase rejects longer addresses anyway; failing here keeps the message ours.
  if (email.length > 254) {
    return { ok: false, errors: { email: "That email address is too long." } };
  }

  return { ok: true, value: email };
}

export function validatePassword(
  raw: FormDataEntryValue | null,
): Validated<string> {
  const password = typeof raw === "string" ? raw : "";

  if (!password) {
    return { ok: false, errors: { password: "Enter a password." } };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      errors: {
        password: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
      },
    };
  }
  // bcrypt silently truncates past 72 bytes, so a longer password is not the
  // extra security it looks like. Reject instead of quietly ignoring the tail.
  if (new TextEncoder().encode(password).length > 72) {
    return {
      ok: false,
      errors: { password: "That password is too long — 72 bytes maximum." },
    };
  }

  return { ok: true, value: password };
}

export function validateCredentials(
  formData: FormData,
): Validated<{ email: string; password: string }> {
  const email = validateEmail(formData.get("email"));
  const password = validatePassword(formData.get("password"));

  // Both fields are reported at once: fixing one error only to be shown the
  // next is a bad first impression on a signup form.
  if (!email.ok || !password.ok) {
    return {
      ok: false,
      errors: {
        ...(email.ok ? {} : email.errors),
        ...(password.ok ? {} : password.errors),
      },
    };
  }

  return { ok: true, value: { email: email.value, password: password.value } };
}

// Guards the `next` parameter on auth redirects. An open redirect on a login
// form is a credential-phishing primitive: an attacker sends a real link to the
// real site that bounces to their copy after sign-in. Only same-site absolute
// paths pass.
export function safeRedirectPath(
  raw: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (!raw) return fallback;
  // Reject protocol-relative ("//evil.com") and absolute URLs outright, plus
  // backslash variants that some parsers normalise into slashes.
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return fallback;
  }
  if (raw.includes("://") || raw.includes("\\")) return fallback;
  return raw;
}

// The paid plans a visitor can arrive at /signup already wanting. Anything
// else — including "free" and garbage — reads as no preference.
export const INTENDED_PLANS = ["pro", "studio"] as const;
export type IntendedPlan = (typeof INTENDED_PLANS)[number];

export function parseIntendedPlan(value: unknown): IntendedPlan | undefined {
  return typeof value === "string" &&
    (INTENDED_PLANS as readonly string[]).includes(value)
    ? (value as IntendedPlan)
    : undefined;
}
