// Reads the error a provider hands back on the OAuth callback.
//
// This exists because of a real incident on 2026-08-16. Facebook refused every
// connect with
//
//   ?error_code=100&error_message=Invalid+Scopes:+pages_manage_posts
//
// and the callback, which only looked for the standard `error` parameter, fell
// through to the state check — where there was no state, because a provider
// that rejects the request never echoes one. The owner saw `bad_state` for
// hours while the server logs held the actual answer. A failure that names the
// wrong cause is worse than one that names none.
//
// So: two spellings, both handled. RFC 6749 says `error` / `error_description`;
// Meta's dialog sends `error_code` / `error_message` (plus `error_reason` when
// the user pressed Cancel). Anything else with an error-ish key still yields a
// generic provider error rather than a misleading one.

export type ProviderError = {
  /** `denied` when the user refused; `provider_error` for anything else. */
  kind: "denied" | "provider_error";
  /** The provider's own message, when it sent one. Shown to the user. */
  message?: string;
};

// The user pressed Cancel rather than the provider refusing the request.
const DENIAL_CODES = new Set(["access_denied", "user_denied", "consent_required"]);

export function readProviderError(
  params: URLSearchParams,
): ProviderError | null {
  const error = params.get("error");
  const reason = params.get("error_reason");
  const code = params.get("error_code");

  if (!error && !reason && !code) return null;

  if (
    (error && DENIAL_CODES.has(error)) ||
    (reason && DENIAL_CODES.has(reason))
  ) {
    return { kind: "denied" };
  }

  const message =
    params.get("error_description") ??
    params.get("error_message") ??
    (error && !DENIAL_CODES.has(error) ? error : null) ??
    undefined;

  return {
    kind: "provider_error",
    // Meta appends "This message is only shown to developers…" to scope
    // errors; keep it, it is the sentence that says what to fix.
    ...(message ? { message: message.trim() } : {}),
  };
}
