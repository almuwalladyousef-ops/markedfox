import { describe, expect, it } from "vitest";

import {
  MIN_PASSWORD_LENGTH,
  safeRedirectPath,
  validateCredentials,
  validateEmail,
  validatePassword,
} from "./validation";

function credentials(email: string, password: string): FormData {
  const data = new FormData();
  data.set("email", email);
  data.set("password", password);
  return data;
}

describe("validateEmail", () => {
  it("normalises case and surrounding whitespace", () => {
    const result = validateEmail("  Owner@MarkedFox.com  ");
    expect(result).toEqual({ ok: true, value: "owner@markedfox.com" });
  });

  it("rejects a missing address", () => {
    expect(validateEmail(null).ok).toBe(false);
    expect(validateEmail("   ").ok).toBe(false);
  });

  it("rejects addresses without a domain dot or with spaces", () => {
    expect(validateEmail("owner@localhost").ok).toBe(false);
    expect(validateEmail("two words@example.com").ok).toBe(false);
  });

  it("rejects addresses beyond the 254-character limit", () => {
    const long = `${"a".repeat(250)}@example.com`;
    expect(validateEmail(long).ok).toBe(false);
  });
});

describe("validatePassword", () => {
  it("accepts a password at exactly the minimum length", () => {
    const password = "a".repeat(MIN_PASSWORD_LENGTH);
    expect(validatePassword(password)).toEqual({ ok: true, value: password });
  });

  it("rejects one character below the minimum", () => {
    const result = validatePassword("a".repeat(MIN_PASSWORD_LENGTH - 1));
    expect(result.ok).toBe(false);
  });

  // bcrypt truncates past 72 bytes, so a longer password is not stronger.
  it("rejects passwords longer than 72 bytes", () => {
    expect(validatePassword("a".repeat(73)).ok).toBe(false);
  });

  it("measures the 72-byte limit in bytes, not characters", () => {
    // 25 four-byte emoji = 100 bytes but only 25 code points.
    expect(validatePassword("🦊".repeat(25)).ok).toBe(false);
    // 18 of them is 72 bytes exactly, which is allowed.
    expect(validatePassword("🦊".repeat(18)).ok).toBe(true);
  });
});

describe("validateCredentials", () => {
  it("reports both field errors at once", () => {
    const result = validateCredentials(credentials("nope", "short"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["email", "password"]);
  });

  it("returns the normalised email alongside the password", () => {
    const result = validateCredentials(
      credentials(" Owner@MarkedFox.com ", "correct horse battery"),
    );
    expect(result).toEqual({
      ok: true,
      value: {
        email: "owner@markedfox.com",
        password: "correct horse battery",
      },
    });
  });
});

describe("safeRedirectPath", () => {
  it("keeps ordinary same-site paths including query strings", () => {
    expect(safeRedirectPath("/dashboard")).toBe("/dashboard");
    expect(safeRedirectPath("/dashboard?tab=posts")).toBe("/dashboard?tab=posts");
  });

  it("falls back when nothing is supplied", () => {
    expect(safeRedirectPath(null)).toBe("/dashboard");
    expect(safeRedirectPath("")).toBe("/dashboard");
    expect(safeRedirectPath(undefined, "/login")).toBe("/login");
  });

  // An open redirect on a login form is a phishing primitive: a genuine link to
  // the real site that lands on an attacker's copy after sign-in.
  it("refuses off-site destinations", () => {
    expect(safeRedirectPath("//evil.com")).toBe("/dashboard");
    expect(safeRedirectPath("https://evil.com")).toBe("/dashboard");
    expect(safeRedirectPath("/\\evil.com")).toBe("/dashboard");
    expect(safeRedirectPath("/redirect?to=https://evil.com")).toBe("/dashboard");
    expect(safeRedirectPath("javascript:alert(1)")).toBe("/dashboard");
  });
});
