import { describe, expect, it, vi } from "vitest";

import { PlatformApiError, PlatformAuthError } from "@/lib/platforms/errors";

import { refreshWithRaceRecovery } from "./refresh";

// X and TikTok rotate refresh tokens; two concurrent publishes on one
// connection both redeem the same single-use token and the loser is told
// "invalid". That must not mark a healthy connection expired.

type Row = { updated_at: string; status: string };

function harness(overrides: {
  refresh?: () => Promise<{ accessToken: string; refreshToken?: string }>;
  rereads?: { row: Row; tokens: { accessToken: string; refreshToken?: string } }[];
}) {
  const initial = {
    row: { updated_at: "2026-08-19T10:00:00Z", status: "active" },
    tokens: { accessToken: "old-access", refreshToken: "old-refresh" },
  };
  const persist = vi.fn(async () => {});
  const markExpired = vi.fn(async () => {});
  const rereads = [...(overrides.rereads ?? [])];
  const reread = vi.fn(async () => rereads.shift() ?? initial);
  const sleep = vi.fn(async () => {});
  const refresh =
    overrides.refresh ??
    (async () => {
      throw new PlatformAuthError("x", "Value passed for the token was invalid.");
    });
  return { initial, persist, markExpired, reread, sleep, refresh };
}

describe("refreshWithRaceRecovery", () => {
  it("persists and returns the fresh pair on success", async () => {
    const h = harness({
      refresh: async () => ({ accessToken: "new-access", refreshToken: "new-refresh" }),
    });
    const out = await refreshWithRaceRecovery(h);
    expect(out.tokens).toEqual({ accessToken: "new-access", refreshToken: "new-refresh" });
    expect(h.persist).toHaveBeenCalledWith({ accessToken: "new-access", refreshToken: "new-refresh" });
    expect(h.markExpired).not.toHaveBeenCalled();
    expect(h.reread).not.toHaveBeenCalled();
  });

  it("uses the pair another caller just rotated instead of marking the grant dead", async () => {
    const h = harness({
      rereads: [
        {
          row: { updated_at: "2026-08-19T10:00:01Z", status: "active" },
          tokens: { accessToken: "rotated-access", refreshToken: "rotated-refresh" },
        },
      ],
    });
    const out = await refreshWithRaceRecovery(h);
    expect(out.tokens.accessToken).toBe("rotated-access");
    expect(h.markExpired).not.toHaveBeenCalled();
    expect(h.persist).not.toHaveBeenCalled();
  });

  it("waits and re-reads more than once, so a rotation still in flight is caught", async () => {
    const h = harness({
      rereads: [
        // First look: nothing changed yet (the other refresh is mid-call).
        {
          row: { updated_at: "2026-08-19T10:00:00Z", status: "active" },
          tokens: { accessToken: "old-access", refreshToken: "old-refresh" },
        },
        // Second look: there it is.
        {
          row: { updated_at: "2026-08-19T10:00:02Z", status: "active" },
          tokens: { accessToken: "rotated-access", refreshToken: "rotated-refresh" },
        },
      ],
    });
    const out = await refreshWithRaceRecovery(h);
    expect(out.tokens.accessToken).toBe("rotated-access");
    expect(h.sleep).toHaveBeenCalled();
    expect(h.markExpired).not.toHaveBeenCalled();
  });

  it("marks the connection expired when the row is genuinely unchanged", async () => {
    const h = harness({});
    await expect(refreshWithRaceRecovery(h)).rejects.toBeInstanceOf(PlatformAuthError);
    expect(h.reread).toHaveBeenCalledTimes(3);
    expect(h.markExpired).toHaveBeenCalledTimes(1);
    expect(h.persist).not.toHaveBeenCalled();
  });

  it("does not treat a row someone marked expired as a rotation", async () => {
    const h = harness({
      rereads: [
        {
          row: { updated_at: "2026-08-19T10:00:01Z", status: "expired" },
          tokens: { accessToken: "old-access", refreshToken: "old-refresh" },
        },
      ],
    });
    await expect(refreshWithRaceRecovery(h)).rejects.toBeInstanceOf(PlatformAuthError);
    expect(h.markExpired).toHaveBeenCalledTimes(1);
  });

  it("leaves the connection active on a non-auth failure and never re-reads", async () => {
    const h = harness({
      refresh: async () => {
        throw new PlatformApiError("x", "HTTP 503", true);
      },
    });
    await expect(refreshWithRaceRecovery(h)).rejects.toBeInstanceOf(PlatformApiError);
    expect(h.reread).not.toHaveBeenCalled();
    expect(h.markExpired).not.toHaveBeenCalled();
  });
});
