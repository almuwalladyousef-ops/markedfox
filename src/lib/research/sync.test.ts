import { describe, expect, it, vi } from "vitest";

import { syncSource, syncSources, type StoredSource, type SyncStore, type VideoUpsert } from "./sync";
import { ResearchProviderError, type SourceVideo } from "./types";

const NOW = new Date("2026-08-19T12:00:00Z");

function source(overrides: Partial<StoredSource> = {}): StoredSource {
  return {
    id: "source-1",
    userId: "user-1",
    workspaceId: "ws-1",
    platform: "youtube",
    externalId: "UC123",
    handle: "@channel",
    title: "A channel",
    connectionId: null,
    ...overrides,
  };
}

function video(externalId: string, viewCount: number | null): SourceVideo {
  return {
    externalId,
    title: externalId,
    description: null,
    url: `https://youtube.com/watch?v=${externalId}`,
    thumbnailUrl: null,
    mediaUrl: null,
    publishedAt: new Date(NOW.getTime() - 30 * 86_400_000).toISOString(),
    durationSeconds: 60,
    viewCount,
    likeCount: null,
    commentCount: null,
  };
}

function memoryStore() {
  const upserted: VideoUpsert[][] = [];
  const baselines: unknown[] = [];
  const errors: { sourceId: string; message: string }[] = [];
  const store: SyncStore = {
    contextFor: vi.fn(async () => ({ accessToken: "token", platformAccountId: "acct" })),
    upsertVideos: vi.fn(async (rows) => {
      upserted.push(rows);
    }),
    updateSourceBaseline: vi.fn(async (input) => {
      baselines.push(input);
    }),
    recordSourceError: vi.fn(async (sourceId, message) => {
      errors.push({ sourceId, message });
    }),
  };
  return { store, upserted, baselines, errors };
}

describe("syncSource", () => {
  it("scores every video against the channel's own baseline and writes both", async () => {
    const { store, upserted, baselines } = memoryStore();

    const result = await syncSource(source(), store, {
      now: NOW,
      listVideos: async () => [
        video("a", 100),
        video("b", 100),
        video("c", 100),
        video("d", 100),
        video("e", 100),
        video("hit", 500),
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.videos).toBe(6);
    expect(result.baselineViews).toBe(100);
    expect(result.outliers).toBe(1);

    const rows = upserted[0];
    expect(rows.find((r) => r.externalId === "hit")?.outlierScore).toBe(5);
    expect(rows.every((r) => r.userId === "user-1" && r.workspaceId === "ws-1")).toBe(true);
    expect(baselines[0]).toMatchObject({ sourceId: "source-1", baselineViews: 100, baselineSample: 6 });
  });

  it("records why a source failed and keeps it in the list", async () => {
    const { store, errors, upserted } = memoryStore();

    const result = await syncSource(source(), store, {
      now: NOW,
      listVideos: async () => {
        throw new ResearchProviderError("Quota is spent", "rate_limited");
      },
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Quota is spent");
    expect(errors).toEqual([{ sourceId: "source-1", message: "Quota is spent" }]);
    // Nothing written, and crucially nothing deleted: the watchlist survives.
    expect(upserted).toHaveLength(0);
  });

  it("only asks for a connection when the provider needs one", async () => {
    const { store } = memoryStore();

    await syncSource(source({ platform: "youtube" }), store, {
      now: NOW,
      listVideos: async () => [],
    });
    expect(store.contextFor).not.toHaveBeenCalled();

    await syncSource(source({ platform: "instagram", connectionId: "conn-1" }), store, {
      now: NOW,
      listVideos: async () => [],
    });
    expect(store.contextFor).toHaveBeenCalledTimes(1);
  });

  it("writes a baseline even when a channel has too few videos to score", async () => {
    const { store, baselines } = memoryStore();

    const result = await syncSource(source(), store, {
      now: NOW,
      listVideos: async () => [video("a", 100), video("b", 200)],
    });

    expect(result.baselineViews).toBeNull();
    expect(baselines[0]).toMatchObject({ baselineViews: null, baselineSample: 2 });
  });
});

describe("syncSources", () => {
  it("keeps going after one source fails", async () => {
    const { store } = memoryStore();
    let call = 0;

    const results = await syncSources(
      [source({ id: "a" }), source({ id: "b" })],
      store,
      {
        now: NOW,
        listVideos: async () => {
          call += 1;
          if (call === 1) throw new Error("platform down");
          return [video("x", 100), video("y", 100), video("z", 100), video("w", 100), video("v", 100)];
        },
      },
    );

    expect(results[0].ok).toBe(false);
    expect(results[1].ok).toBe(true);
  });
});
