import { describe, expect, it, vi } from "vitest";

import type { EntitlementSnapshot } from "@/lib/entitlements/types";
import { PlatformApiError, PlatformAuthError } from "@/lib/platforms/errors";
import { getPlatform } from "@/lib/platforms/registry";
import type {
  Platform,
  PlatformAdapter,
  PublishInput,
} from "@/lib/platforms/types";

import { publishPost } from "./publish-post";
import type {
  HistoryEntry,
  PostRow,
  PublishStore,
  TargetConnection,
  UsageEntry,
} from "./types";

// ── fixtures ──────────────────────────────────────────────────────────────

const USER = "user-a";
const WS = "ws-a";

const proSnapshot = (): EntitlementSnapshot => ({
  planId: "pro",
  limits: {
    postsPerDay: null,
    maxConnectedAccountsPerWorkspace: null,
    maxWorkspaces: 5,
    platforms: null,
    xPostsPerMonth: 300,
    xLinksAllowed: false,
    dmRulesMax: null,
    dmSendsPerMonth: 10000,
    videoUploadMinutesPerMonth: 600,
    funnels: true,
    researchCreditsPerMonth: 0,
  },
  usage: {
    postsToday: 0,
    xPostsThisMonth: 0,
    dmSendsThisMonth: 0,
    dmRuleCount: 0,
    videoMinutesThisMonth: 0,
    connectedAccountsInWorkspace: 3,
    workspaceCount: 1,
  },
});

const freeSnapshot = (): EntitlementSnapshot => {
  const s = proSnapshot();
  s.planId = "free";
  s.limits.postsPerDay = 2;
  s.limits.maxConnectedAccountsPerWorkspace = 3;
  s.limits.maxWorkspaces = 2;
  s.limits.platforms = ["instagram", "facebook", "threads", "tiktok", "youtube"];
  s.limits.xPostsPerMonth = 0;
  return s;
};

const connection = (
  id: string,
  platform: Platform,
  extra: Partial<TargetConnection> = {},
): TargetConnection => ({
  id,
  user_id: USER,
  workspace_id: WS,
  platform,
  platform_account_id: `${platform}-acct`,
  platform_account_name: `@${platform}`,
  status: "active",
  ...extra,
});

const post = (overrides: Partial<PostRow> = {}): PostRow => ({
  id: "post-1",
  user_id: USER,
  workspace_id: WS,
  caption: "hello world",
  media: [{ url: "https://cdn.example.com/a.jpg", type: "image" }],
  platform_overrides: {},
  target_connection_ids: [],
  status: "publishing",
  scheduled_for: null,
  published_at: null,
  attempt_count: 1,
  last_error: null,
  created_at: new Date().toISOString(),
  ...overrides,
});

// A fake adapter that borrows the real capabilities/rules of a registered
// platform (so validation is the real thing) but has a scripted publish().
function fakeAdapter(
  platform: Platform,
  publish: PlatformAdapter["publish"],
  base: Platform = platform === "x" ? "threads" : platform,
): PlatformAdapter {
  const real = getPlatform(base);
  return {
    ...real,
    id: platform,
    displayName: platform,
    // X: 280 chars, up to 4 items, one video, no mixing.
    rules:
      platform === "x"
        ? { captionMaxChars: 280, mediaMax: 4, maxVideos: 1, mixedMediaAllowed: false, hashtagMax: null }
        : real.rules,
    publish,
  };
}

class MemoryStore implements PublishStore {
  connections: TargetConnection[] = [];
  snapshot: EntitlementSnapshot = proSnapshot();
  history: HistoryEntry[] = [];
  usage: UsageEntry[] = [];
  expired: string[] = [];
  finished: { status: string; publishedAt: Date | null; lastError: string | null } | null = null;
  tokenFailure: Error | null = null;

  async loadTargets(p: PostRow) {
    return this.connections.filter(
      (c) =>
        p.target_connection_ids.includes(c.id) &&
        c.user_id === p.user_id &&
        c.workspace_id === p.workspace_id,
    );
  }
  async loadSnapshot() {
    return this.snapshot;
  }
  async getTokens(connectionId: string) {
    if (this.tokenFailure) throw this.tokenFailure;
    return { accessToken: `token-for-${connectionId}` };
  }
  async markConnectionExpired(id: string) {
    this.expired.push(id);
  }
  async recordHistory(entry: HistoryEntry) {
    this.history.push(entry);
  }
  async recordUsage(entry: UsageEntry) {
    this.usage.push(entry);
  }
  async finishPost(_p: PostRow, result: { status: string; publishedAt: Date | null; lastError: string | null }) {
    this.finished = result;
  }
}

const quiet = { error: () => {}, warn: () => {} };

// ── tests ────────────────────────────────────────────────────────────────

describe("publishPost", () => {
  it("publishes to every target and records history, usage, and status", async () => {
    const store = new MemoryStore();
    store.connections = [connection("c-ig", "instagram"), connection("c-th", "threads")];
    const calls: PublishInput[] = [];
    const adapters: Partial<Record<Platform, PlatformAdapter>> = {
      instagram: fakeAdapter("instagram", async (input) => {
        calls.push(input);
        return { platformPostId: "ig-1", url: "https://instagram.com/p/1" };
      }),
      threads: fakeAdapter("threads", async (input) => {
        calls.push(input);
        return { platformPostId: "th-1" };
      }),
    };

    const report = await publishPost(
      { store, getAdapter: (p) => adapters[p]!, log: quiet },
      post({ target_connection_ids: ["c-ig", "c-th"] }),
    );

    expect(report.status).toBe("published");
    expect(report.targets.map((t) => t.outcome)).toEqual(["published", "published"]);
    expect(calls.map((c) => c.platformAccountId)).toEqual(["instagram-acct", "threads-acct"]);
    expect(calls[0].tokens.accessToken).toBe("token-for-c-ig");

    expect(store.history).toHaveLength(2);
    expect(store.history.map((h) => [h.platform, h.outcome, h.platformPostId])).toEqual([
      ["instagram", "published", "ig-1"],
      ["threads", "published", "th-1"],
    ]);
    // One post = one post_publish row, however many platforms it went to.
    expect(store.usage.map((u) => u.kind)).toEqual(["post_publish"]);
    expect(store.usage[0].refId).toBe("post-1");
    expect(store.finished?.status).toBe("published");
    expect(store.finished?.publishedAt).toBeInstanceOf(Date);
    expect(store.finished?.lastError).toBeNull();
  });

  it("reports a partial failure naming exactly which platform failed and why", async () => {
    const store = new MemoryStore();
    store.connections = [connection("c-ig", "instagram"), connection("c-fb", "facebook")];
    const adapters: Partial<Record<Platform, PlatformAdapter>> = {
      instagram: fakeAdapter("instagram", async () => ({ platformPostId: "ig-1" })),
      facebook: fakeAdapter("facebook", async () => {
        throw new PlatformApiError("facebook", "(#100) Invalid parameter", false);
      }),
    };

    const report = await publishPost(
      { store, getAdapter: (p) => adapters[p]!, log: quiet },
      post({ target_connection_ids: ["c-ig", "c-fb"] }),
    );

    expect(report.status).toBe("partial");
    const fb = report.targets.find((t) => t.platform === "facebook")!;
    expect(fb.outcome).toBe("failed");
    if (fb.outcome === "failed") {
      expect(fb.code).toBe("platform_error");
      expect(fb.error).toBe("facebook: (#100) Invalid parameter");
    }
    expect(store.finished?.status).toBe("partial");
    expect(store.finished?.lastError).toBe("facebook (@facebook): facebook: (#100) Invalid parameter");
    // The success still counts as a post; the failure is in history.
    expect(store.usage.map((u) => u.kind)).toEqual(["post_publish"]);
    expect(store.history.find((h) => h.platform === "facebook")?.detail).toEqual({
      code: "platform_error",
      retryable: false,
    });
  });

  it("refuses an X post containing a link server-side and never calls the adapter", async () => {
    const store = new MemoryStore();
    store.connections = [connection("c-x", "x")];
    const publish = vi.fn(async () => ({ platformPostId: "x-1" }));

    const report = await publishPost(
      { store, getAdapter: () => fakeAdapter("x", publish), log: quiet },
      post({ caption: "read more at markedfox.com", media: [], target_connection_ids: ["c-x"] }),
    );

    expect(publish).not.toHaveBeenCalled();
    expect(report.status).toBe("failed");
    expect(report.targets[0]).toMatchObject({
      outcome: "failed",
      code: "x_links_blocked",
      error: "Posts to X cannot contain external links",
    });
    expect(store.usage).toEqual([]);
  });

  it("refuses the 301st X post of the month", async () => {
    const store = new MemoryStore();
    store.connections = [connection("c-x", "x")];
    store.snapshot.usage.xPostsThisMonth = 300;
    const publish = vi.fn(async () => ({ platformPostId: "x-1" }));

    const report = await publishPost(
      { store, getAdapter: () => fakeAdapter("x", publish), log: quiet },
      post({ caption: "post 301", media: [], target_connection_ids: ["c-x"] }),
    );

    expect(publish).not.toHaveBeenCalled();
    expect(report.targets[0]).toMatchObject({ outcome: "failed", code: "x_monthly_cap" });
  });

  it("lets the 300th X post through and writes an x_post usage row per X account", async () => {
    const store = new MemoryStore();
    store.connections = [connection("c-x", "x")];
    store.snapshot.usage.xPostsThisMonth = 299;

    const report = await publishPost(
      { store, getAdapter: () => fakeAdapter("x", async () => ({ platformPostId: "x-300" })), log: quiet },
      post({ caption: "post 300", media: [], target_connection_ids: ["c-x"] }),
    );

    expect(report.status).toBe("published");
    expect(store.usage.map((u) => [u.kind, u.platform])).toEqual([
      ["post_publish", undefined],
      ["x_post", "x"],
    ]);
  });

  it("two X accounts in one post cannot both squeeze through one remaining slot", async () => {
    const store = new MemoryStore();
    store.connections = [connection("c-x1", "x"), connection("c-x2", "x")];
    store.snapshot.usage.xPostsThisMonth = 299;
    const publish = vi.fn(async () => ({ platformPostId: "x" }));

    const report = await publishPost(
      { store, getAdapter: () => fakeAdapter("x", publish), log: quiet },
      post({ caption: "one slot", media: [], target_connection_ids: ["c-x1", "c-x2"] }),
    );

    expect(publish).toHaveBeenCalledTimes(1);
    expect(report.status).toBe("partial");
    expect(report.targets[1]).toMatchObject({ outcome: "failed", code: "x_monthly_cap" });
  });

  it("refuses a plan-locked platform by API, not merely in the UI", async () => {
    const store = new MemoryStore();
    store.snapshot = freeSnapshot();
    store.connections = [connection("c-x", "x"), connection("c-th", "threads")];
    const xPublish = vi.fn(async () => ({ platformPostId: "x-1" }));
    const adapters: Partial<Record<Platform, PlatformAdapter>> = {
      x: fakeAdapter("x", xPublish),
      threads: fakeAdapter("threads", async () => ({ platformPostId: "th-1" })),
    };

    const report = await publishPost(
      { store, getAdapter: (p) => adapters[p]!, log: quiet },
      post({ caption: "free user", media: [], target_connection_ids: ["c-x", "c-th"] }),
    );

    expect(xPublish).not.toHaveBeenCalled();
    expect(report.status).toBe("partial");
    expect(report.targets[0]).toMatchObject({ outcome: "failed", code: "plan_platform_locked" });
    expect(report.targets[1].outcome).toBe("published");
  });

  it("refuses every target once the daily post cap is reached", async () => {
    const store = new MemoryStore();
    store.snapshot = freeSnapshot();
    store.snapshot.usage.postsToday = 2;
    store.connections = [connection("c-ig", "instagram"), connection("c-th", "threads")];
    const publish = vi.fn(async () => ({ platformPostId: "p" }));

    const report = await publishPost(
      { store, getAdapter: (p) => fakeAdapter(p, publish), log: quiet },
      post({ target_connection_ids: ["c-ig", "c-th"] }),
    );

    expect(publish).not.toHaveBeenCalled();
    expect(report.status).toBe("failed");
    expect(report.targets.every((t) => t.outcome === "failed" && t.code === "posts_daily_cap")).toBe(true);
    expect(store.usage).toEqual([]);
    expect(store.finished?.status).toBe("failed");
  });

  it("validates content per platform before calling anything", async () => {
    const store = new MemoryStore();
    store.connections = [connection("c-ig", "instagram"), connection("c-th", "threads")];
    const publish = vi.fn(async () => ({ platformPostId: "p" }));

    // No media: Instagram refuses, Threads is happy.
    const report = await publishPost(
      { store, getAdapter: (p) => fakeAdapter(p, publish), log: quiet },
      post({ caption: "text only", media: [], target_connection_ids: ["c-ig", "c-th"] }),
    );

    expect(publish).toHaveBeenCalledTimes(1);
    expect(report.targets[0]).toMatchObject({
      platform: "instagram",
      outcome: "failed",
      code: "invalid_content",
    });
    expect(report.targets[1].outcome).toBe("published");
  });

  it("applies per-platform caption overrides", async () => {
    const store = new MemoryStore();
    store.connections = [connection("c-fb", "facebook"), connection("c-th", "threads")];
    const captions: Record<string, string> = {};
    const adapters: Partial<Record<Platform, PlatformAdapter>> = {
      facebook: fakeAdapter("facebook", async (i) => {
        captions.facebook = i.caption;
        return { platformPostId: "fb" };
      }),
      threads: fakeAdapter("threads", async (i) => {
        captions.threads = i.caption;
        return { platformPostId: "th" };
      }),
    };

    await publishPost(
      { store, getAdapter: (p) => adapters[p]!, log: quiet },
      post({
        caption: "long form for facebook",
        media: [],
        platform_overrides: { threads: { caption: "short for threads" } },
        target_connection_ids: ["c-fb", "c-th"],
      }),
    );

    expect(captions).toEqual({
      facebook: "long form for facebook",
      threads: "short for threads",
    });
  });

  it("marks the connection expired on an auth error and asks for a reconnect", async () => {
    const store = new MemoryStore();
    store.connections = [connection("c-ig", "instagram")];

    const report = await publishPost(
      {
        store,
        getAdapter: () =>
          fakeAdapter("instagram", async () => {
            throw new PlatformAuthError("instagram", "Error validating access token");
          }),
        log: quiet,
      },
      post({ target_connection_ids: ["c-ig"] }),
    );

    expect(store.expired).toEqual(["c-ig"]);
    expect(report.targets[0]).toMatchObject({ outcome: "failed", code: "auth_error" });
    if (report.targets[0].outcome === "failed") {
      expect(report.targets[0].error).toMatch(/reconnected/);
    }
  });

  it("skips inactive and missing connections without touching the platform", async () => {
    const store = new MemoryStore();
    store.connections = [connection("c-old", "instagram", { status: "expired" })];
    const publish = vi.fn(async () => ({ platformPostId: "p" }));

    const report = await publishPost(
      { store, getAdapter: (p) => fakeAdapter(p, publish), log: quiet },
      post({ target_connection_ids: ["c-old", "c-gone"] }),
    );

    expect(publish).not.toHaveBeenCalled();
    expect(report.targets.map((t) => (t.outcome === "failed" ? t.code : t.outcome))).toEqual([
      "connection_inactive",
      "connection_missing",
    ]);
    // History has a row for the known connection only — the missing one has
    // no platform to file under.
    expect(store.history.map((h) => h.connectionId)).toEqual(["c-old"]);
    expect(store.finished?.lastError).toContain("unknown: That account is no longer connected.");
  });

  it("only sees connections owned by the post's user and workspace", async () => {
    const store = new MemoryStore();
    // Same id the post targets, but another tenant's row.
    store.connections = [connection("c-1", "threads", { user_id: "user-b", workspace_id: "ws-b" })];
    const publish = vi.fn(async () => ({ platformPostId: "p" }));

    const report = await publishPost(
      { store, getAdapter: (p) => fakeAdapter(p, publish), log: quiet },
      post({ caption: "x", media: [], target_connection_ids: ["c-1"] }),
    );

    expect(publish).not.toHaveBeenCalled();
    expect(report.targets[0]).toMatchObject({ outcome: "failed", code: "connection_missing" });
  });

  it("still returns the report and finishes the post when a history write fails", async () => {
    const store = new MemoryStore();
    store.connections = [connection("c-th", "threads")];
    store.recordHistory = async () => {
      throw new Error("db down");
    };
    const errors: unknown[] = [];

    const report = await publishPost(
      {
        store,
        getAdapter: () => fakeAdapter("threads", async () => ({ platformPostId: "th" })),
        log: { error: (...args: unknown[]) => errors.push(args), warn: () => {} },
      },
      post({ caption: "x", media: [], target_connection_ids: ["c-th"] }),
    );

    expect(report.status).toBe("published");
    expect(store.finished?.status).toBe("published");
    expect(errors.length).toBeGreaterThan(0);
  });

  it("refuses a TikTok target whose options lack a privacy level, and passes options through when present", async () => {
    // The adapter's validateOptions is the gate; TikTok's real one is used
    // (fakeAdapter spreads the real adapter), publish() is scripted.
    const store = new MemoryStore();
    store.connections = [connection("c-tt", "tiktok")];
    const publish = vi.fn<PlatformAdapter["publish"]>(async () => ({ platformPostId: "tt-1" }));
    const deps = { store, getAdapter: (p: Platform) => fakeAdapter(p, publish), log: quiet };

    const refused = await publishPost(
      deps,
      post({
        caption: "x",
        media: [{ url: "https://cdn.example.com/v.mp4", type: "video" }],
        target_connection_ids: ["c-tt"],
      }),
    );
    expect(publish).not.toHaveBeenCalled();
    expect(refused.targets[0]).toMatchObject({ outcome: "failed", code: "invalid_content" });
    expect(refused.targets[0].outcome === "failed" ? refused.targets[0].error : "").toMatch(
      /Choose who can see this TikTok post/,
    );

    const ok = await publishPost(
      deps,
      post({
        caption: "x",
        media: [{ url: "https://cdn.example.com/v.mp4", type: "video" }],
        target_connection_ids: ["c-tt"],
        platform_overrides: {
          tiktok: { options: { privacy_level: "SELF_ONLY", allow_comment: true } },
        },
      }),
    );
    expect(ok.status).toBe("published");
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][0]).toMatchObject({
      options: { privacy_level: "SELF_ONLY", allow_comment: true },
    });
  });
});
