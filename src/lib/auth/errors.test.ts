import { describe, expect, it } from "vitest";

import { authErrorMessage, isEmailSendRateLimit } from "./errors";

// The case that produced this file: registration refused twice, for two valid
// addresses, with the provider's own line "email rate limit exceeded" printed
// on the form. The project's mail quota is shared, so the person on the page
// had done nothing wrong and nothing they could type would help.

describe("email send rate limit", () => {
  it("recognises the code GoTrue sends", () => {
    expect(
      isEmailSendRateLimit({ code: "over_email_send_rate_limit", status: 429 }),
    ).toBe(true);
  });

  it("recognises the bare message from a release that sends no code", () => {
    expect(isEmailSendRateLimit({ message: "email rate limit exceeded" })).toBe(
      true,
    );
  });

  it("is not fooled by an unrelated rate limit", () => {
    expect(
      isEmailSendRateLimit({ code: "over_request_rate_limit", status: 429 }),
    ).toBe(false);
  });

  it("says the send failed and that waiting fixes it", () => {
    const line = authErrorMessage({ code: "over_email_send_rate_limit" });
    expect(line).toMatch(/could not send/i);
    expect(line).toMatch(/try again/i);
  });

  // The same line answers a signup, a resend and an email change, so it must
  // not claim anything about what was created. signUp adds that itself.
  it("claims nothing about what was created", () => {
    expect(authErrorMessage({ code: "over_email_send_rate_limit" })).not.toMatch(
      /created/i,
    );
  });
});

describe("what reaches the form", () => {
  // The whole point: a provider message is never shown, whatever it says.
  it("never returns the raw message", () => {
    const raw = "email rate limit exceeded";
    expect(authErrorMessage({ message: raw })).not.toBe(raw);
    expect(authErrorMessage({ message: "pq: relation does not exist" })).not.toContain(
      "pq:",
    );
  });

  it("translates the codes a person can act on", () => {
    expect(authErrorMessage({ code: "email_exists" })).toMatch(/already in use/i);
    expect(authErrorMessage({ code: "weak_password" })).toMatch(/password/i);
    expect(authErrorMessage({ code: "email_address_invalid" })).toMatch(/email/i);
  });

  it("treats an unlabelled 429 as a rate limit rather than a mystery", () => {
    expect(authErrorMessage({ status: 429, message: "whatever" })).toMatch(
      /too many/i,
    );
  });

  it("falls back rather than inventing detail for an unknown failure", () => {
    expect(authErrorMessage({ code: "something_new_in_gotrue" })).toMatch(
      /try again/i,
    );
    expect(authErrorMessage(null)).toMatch(/try again/i);
  });
});
