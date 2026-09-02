import { describe, expect, it } from "vitest";

import { ALLOW_HEADER, ALLOWED_METHODS, isAllowedMethod } from "./methods";

describe("isAllowedMethod", () => {
  it("refuses TRACE, which the framework used to answer with a 500", () => {
    expect(isAllowedMethod("TRACE")).toBe(false);
    expect(isAllowedMethod("TRACK")).toBe(false);
    expect(isAllowedMethod("CONNECT")).toBe(false);
  });

  it("keeps every method the app actually serves", () => {
    // POST is the Stripe and Meta webhooks; OPTIONS is the browser preflight.
    for (const method of ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      expect(isAllowedMethod(method)).toBe(true);
    }
  });

  it("refuses an invented method rather than letting it reach the framework", () => {
    expect(isAllowedMethod("FROBNICATE")).toBe(false);
    expect(isAllowedMethod("")).toBe(false);
    expect(isAllowedMethod(undefined)).toBe(false);
  });

  it("compares case-insensitively", () => {
    expect(isAllowedMethod("post")).toBe(true);
    expect(isAllowedMethod("trace")).toBe(false);
  });

  it("advertises exactly the allowed set in the Allow header", () => {
    expect(ALLOW_HEADER).toBe(ALLOWED_METHODS.join(", "));
    expect(ALLOW_HEADER).not.toContain("TRACE");
  });
});
