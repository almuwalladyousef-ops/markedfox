import { describe, expect, it, vi } from "vitest";

import type { Platform } from "@/lib/platforms/types";

import {
  refreshExpiringConnections,
  type ExpiringConnection,
  type RefreshStore,
} from "./refresh";

const NOW = new Date("2026-08-16T12:00:00Z");
const WINDOW = 7 * 24 * 60 * 60 * 1000;
const quiet = { error: () => {}, log: () => {} };

const connection = (
  id: string,
  platform: Platform = "threads",
  expires = "2026-08-20T00:00:00Z",
): ExpiringConnection => ({ id, platform, tokenExpiresAt: expires });

function store(
  due: ExpiringConnection[],
  refresh: RefreshStore["refresh"] = async () => {},
): RefreshStore & { asked: Date[] } {
  const asked: Date[] = [];
  return {
    asked,
    async listExpiring(before) {
      asked.push(before);
      return due;
    },
    refresh,
  };
}

describe("refreshExpiringConnections", () => {
  it("asks for connections expiring inside the window", async () => {
    const s = store([]);
    const summary = await refreshExpiringConnections(s, {
      windowMs: WINDOW,
      now: () => NOW,
      log: quiet,
    });

    expect(s.asked).toEqual([new Date("2026-08-23T12:00:00Z")]);
    expect(summary).toEqual({ due: 0, refreshed: 0, failed: 0, outcomes: [] });
  });

  it("renews every due connection", async () => {
    const renewed: string[] = [];
    const s = store(
      [connection("c-1"), connection("c-2"), connection("c-3", "instagram")],
      async (id) => {
        renewed.push(id);
      },
    );

    const summary = await refreshExpiringConnections(s, {
      windowMs: WINDOW,
      now: () => NOW,
      log: quiet,
    });

    expect(renewed).toEqual(["c-1", "c-2", "c-3"]);
    expect(summary.due).toBe(3);
    expect(summary.refreshed).toBe(3);
    expect(summary.failed).toBe(0);
    expect(summary.outcomes.every((o) => o.ok)).toBe(true);
  });

  it("keeps going when one connection fails, and reports which", async () => {
    const renewed: string[] = [];
    const s = store([connection("c-1"), connection("c-2"), connection("c-3")], async (id) => {
      if (id === "c-2") throw new Error("threads: Invalid OAuth access token");
      renewed.push(id);
    });

    const summary = await refreshExpiringConnections(s, {
      windowMs: WINDOW,
      now: () => NOW,
      log: quiet,
    });

    // The failure must not cost c-3 its renewal — that is the whole point.
    expect(renewed).toEqual(["c-1", "c-3"]);
    expect(summary).toMatchObject({ due: 3, refreshed: 2, failed: 1 });
    const failure = summary.outcomes.find((o) => !o.ok);
    expect(failure).toMatchObject({
      connectionId: "c-2",
      platform: "threads",
      ok: false,
      error: "threads: Invalid OAuth access token",
    });
  });

  it("logs a line per renewal and per failure", async () => {
    const logged: string[] = [];
    const errored: string[] = [];
    const s = store([connection("c-1"), connection("c-2")], async (id) => {
      if (id === "c-2") throw new Error("boom");
    });

    await refreshExpiringConnections(s, {
      windowMs: WINDOW,
      now: () => NOW,
      log: {
        log: (m: string) => logged.push(m),
        error: (m: string) => errored.push(m),
      },
    });

    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain("c-1");
    expect(errored).toHaveLength(1);
    expect(errored[0]).toContain("c-2");
    expect(errored[0]).toContain("boom");
  });

  it("propagates a failure to list the connections at all", async () => {
    const s: RefreshStore = {
      listExpiring: async () => {
        throw new Error("db down");
      },
      refresh: vi.fn(),
    };

    await expect(
      refreshExpiringConnections(s, { windowMs: WINDOW, now: () => NOW, log: quiet }),
    ).rejects.toThrow("db down");
    expect(s.refresh).not.toHaveBeenCalled();
  });
});
