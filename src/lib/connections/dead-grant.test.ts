import { describe, expect, it } from "vitest";

import { PlatformApiError, PlatformAuthError } from "@/lib/platforms/errors";

import { isDeadGrant } from "./refresh";

// The distinction that decides whether a failed renewal costs the user a
// reconnect. Since refreshExpiringConnections() now renews on a timer, getting
// this wrong would mark healthy accounts `expired` on any passing outage.
describe("isDeadGrant", () => {
  it("is true only for an auth error", () => {
    expect(isDeadGrant(new PlatformAuthError("threads", "token revoked"))).toBe(true);
  });

  it("is false for retryable and non-retryable API errors", () => {
    expect(isDeadGrant(new PlatformApiError("threads", "HTTP 500", true))).toBe(false);
    expect(isDeadGrant(new PlatformApiError("threads", "rate limited", true))).toBe(false);
    expect(isDeadGrant(new PlatformApiError("threads", "(#100) bad param", false))).toBe(false);
  });

  it("is false for network and unknown failures", () => {
    expect(isDeadGrant(new TypeError("fetch failed"))).toBe(false);
    expect(isDeadGrant(new Error("boom"))).toBe(false);
    expect(isDeadGrant("nope")).toBe(false);
    expect(isDeadGrant(undefined)).toBe(false);
  });
});
