import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { encodeForm, isStripeConfigured, verifyStripeSignature } from "./stripe";

const SECRET = "whsec_test_secret";
const NOW = new Date("2026-08-19T12:00:00Z");

function sign(body: string, at: Date = NOW, secret: string = SECRET): string {
  const timestamp = Math.floor(at.getTime() / 1000);
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`, "utf8")
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

describe("verifyStripeSignature", () => {
  const body = '{"id":"evt_1","type":"customer.subscription.updated"}';

  it("accepts a correctly signed body", () => {
    expect(verifyStripeSignature(body, sign(body), SECRET, NOW).ok).toBe(true);
  });

  it("rejects a body that changed after signing", () => {
    const verdict = verifyStripeSignature(body + " ", sign(body), SECRET, NOW);
    expect(verdict.ok).toBe(false);
  });

  it("rejects the wrong secret — a forged event could grant any plan", () => {
    const verdict = verifyStripeSignature(body, sign(body, NOW, "whsec_other"), SECRET, NOW);
    expect(verdict.ok).toBe(false);
  });

  it("rejects a missing header", () => {
    const verdict = verifyStripeSignature(body, null, SECRET, NOW);
    expect(verdict.ok).toBe(false);
  });

  it("rejects a replay from outside the tolerance window", () => {
    const old = new Date(NOW.getTime() - 10 * 60_000);
    const verdict = verifyStripeSignature(body, sign(body, old), SECRET, NOW);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain("tolerance");
  });

  it("accepts inside the tolerance window", () => {
    const recent = new Date(NOW.getTime() - 60_000);
    expect(verifyStripeSignature(body, sign(body, recent), SECRET, NOW).ok).toBe(true);
  });

  it("accepts when one of several v1 signatures matches (key rotation)", () => {
    const timestamp = Math.floor(NOW.getTime() / 1000);
    const good = createHmac("sha256", SECRET).update(`${timestamp}.${body}`).digest("hex");
    const header = `t=${timestamp},v1=${"0".repeat(64)},v1=${good}`;
    expect(verifyStripeSignature(body, header, SECRET, NOW).ok).toBe(true);
  });

  it("ignores signature schemes it does not know rather than trusting them", () => {
    const timestamp = Math.floor(NOW.getTime() / 1000);
    const header = `t=${timestamp},v0=${"a".repeat(64)}`;
    const verdict = verifyStripeSignature(body, header, SECRET, NOW);
    expect(verdict.ok).toBe(false);
  });
});

describe("encodeForm", () => {
  it("encodes flat fields", () => {
    expect(encodeForm({ mode: "subscription", customer: "cus_1" })).toBe(
      "mode=subscription&customer=cus_1",
    );
  });

  it("encodes nested objects and arrays in Stripe's bracket notation", () => {
    expect(
      encodeForm({ line_items: [{ price: "price_1", quantity: 1 }] }),
    ).toBe(
      "line_items%5B0%5D%5Bprice%5D=price_1&line_items%5B0%5D%5Bquantity%5D=1",
    );
  });

  it("encodes metadata maps", () => {
    expect(encodeForm({ metadata: { user_id: "u-1" } })).toBe(
      "metadata%5Buser_id%5D=u-1",
    );
  });

  it("skips null and undefined rather than sending the string 'null'", () => {
    expect(encodeForm({ a: 1, b: null, c: undefined })).toBe("a=1");
  });

  it("escapes reserved characters in values", () => {
    expect(encodeForm({ success_url: "https://x.com/a?b=c" })).toBe(
      "success_url=https%3A%2F%2Fx.com%2Fa%3Fb%3Dc",
    );
  });
});

describe("isStripeConfigured", () => {
  it("is false without the secret key, so the UI offers no dead button", () => {
    expect(isStripeConfigured({})).toBe(false);
    expect(isStripeConfigured({ STRIPE_SECRET_KEY: "sk_test_1" })).toBe(true);
  });
});
