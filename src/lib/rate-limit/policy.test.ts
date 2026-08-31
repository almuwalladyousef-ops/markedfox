import { describe, expect, it } from "vitest";

import {
  clientIpFrom,
  RATE_LIMITS,
  rateLimitKey,
  type RateLimitName,
} from "./policy";

function headers(map: Record<string, string>) {
  return { get: (name: string) => map[name.toLowerCase()] ?? null };
}

describe("rate limit keys", () => {
  it("folds case and whitespace so one address is one bucket", () => {
    expect(rateLimitKey("signInEmail", "  A@B.com ")).toBe(
      "signInEmail:a@b.com",
    );
  });

  it("keeps different policies in different buckets for the same subject", () => {
    expect(rateLimitKey("signInEmail", "a@b.com")).not.toBe(
      rateLimitKey("passwordResetEmail", "a@b.com"),
    );
  });

  // The key is a primary key and the subject is attacker-controlled.
  it("truncates a subject somebody pads to be enormous", () => {
    const key = rateLimitKey("signInEmail", "x".repeat(5_000));
    expect(key.length).toBeLessThan(250);
  });
});

describe("client ip", () => {
  it("takes the left-most entry of x-forwarded-for", () => {
    expect(
      clientIpFrom(headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })),
    ).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip", () => {
    expect(clientIpFrom(headers({ "x-real-ip": "203.0.113.9" }))).toBe(
      "203.0.113.9",
    );
  });

  // Null, not a constant like "unknown": one shared bucket for every
  // unidentifiable caller would let one of them lock out all the others.
  it("returns null when the proxy forwarded nothing", () => {
    expect(clientIpFrom(headers({}))).toBeNull();
  });

  it("bounds a header somebody stuffed", () => {
    const ip = clientIpFrom(headers({ "x-forwarded-for": "9".repeat(1_000) }));
    expect(ip && ip.length).toBeLessThanOrEqual(64);
  });
});

describe("policies", () => {
  const names = Object.keys(RATE_LIMITS) as RateLimitName[];

  it("every policy allows more than a person does and less than a script", () => {
    for (const name of names) {
      const policy = RATE_LIMITS[name];
      expect(policy.limit, name).toBeGreaterThan(3);
      expect(policy.limit, name).toBeLessThanOrEqual(60);
      expect(policy.windowSeconds, name).toBeGreaterThanOrEqual(300);
    }
  });

  // The refusal is shown to somebody who probably just mistyped a password.
  it("every message tells the person what to do without accusing them", () => {
    for (const name of names) {
      const { message } = RATE_LIMITS[name];
      expect(message, name).toMatch(/try again|check your inbox/i);
      expect(message, name).not.toMatch(/blocked|banned|denied|forbidden/i);
    }
  });

  // Sign-in is the one an attacker grinds; reset is the one that spends our
  // sending reputation. Neither may be the loosest limit in the file.
  it("keeps the per-email limits tighter than the per-network ones", () => {
    expect(RATE_LIMITS.signInEmail.limit).toBeLessThan(
      RATE_LIMITS.signInIp.limit,
    );
    expect(RATE_LIMITS.passwordResetEmail.limit).toBeLessThan(
      RATE_LIMITS.passwordResetIp.limit,
    );
  });
});
