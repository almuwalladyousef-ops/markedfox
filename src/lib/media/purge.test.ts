import { describe, expect, it, vi } from "vitest";

import type { PostStatus } from "@/lib/publish/types";

import {
  isPurgeable,
  keyForPublicUrl,
  ORPHAN_GRACE_MS,
  purgeMedia,
  PURGE_GRACE_MS,
  type MediaPurgeStore,
  type PurgeablePost,
  type StoredObject,
} from "./purge";

const BASE = "https://pub-abc.r2.dev";
const NOW = new Date("2026-08-16T18:00:00Z");

const post = (over: Partial<PurgeablePost> = {}): PurgeablePost => ({
  id: "p-1",
  status: "published",
  mediaUrls: [`${BASE}/u/w/a.mp4`],
  settledAt: NOW.toISOString(),
  ...over,
});

function store(posts: PurgeablePost[], objects: StoredObject[] = []) {
  const deleted: string[] = [];
  const marked: string[] = [];
  const s: MediaPurgeStore & { deleted: string[]; marked: string[] } = {
    deleted,
    marked,
    async listUnpurgedPosts() {
      return posts;
    },
    async listObjects() {
      return objects;
    },
    async deleteObject(key) {
      deleted.push(key);
    },
    async markPurged(id) {
      marked.push(id);
    },
  };
  return s;
}

const object = (key: string, ageMs: number, sizeBytes = 1024): StoredObject => ({
  key,
  uploadedAt: new Date(NOW.getTime() - ageMs),
  sizeBytes,
});

describe("keyForPublicUrl", () => {
  it("extracts the key from one of our URLs", () => {
    expect(keyForPublicUrl(`${BASE}/u/w/a.mp4`, BASE)).toBe("u/w/a.mp4");
    expect(keyForPublicUrl(`${BASE}/u/w/a.mp4`, `${BASE}/`)).toBe("u/w/a.mp4");
  });

  it("decodes percent-encoding", () => {
    expect(keyForPublicUrl(`${BASE}/u/w/a%20b.jpg`, BASE)).toBe("u/w/a b.jpg");
  });

  it("refuses anything that is not ours — we must never delete a stranger's URL", () => {
    expect(keyForPublicUrl("https://example.com/a.jpg", BASE)).toBeNull();
    expect(keyForPublicUrl("https://pub-abc.r2.dev.evil.com/a.jpg", BASE)).toBeNull();
    // A lookalike prefix without the separating slash must not match.
    expect(keyForPublicUrl("https://pub-abcd.r2.dev/a.jpg", BASE)).toBeNull();
    expect(keyForPublicUrl(BASE, BASE)).toBeNull();
    expect(keyForPublicUrl(`${BASE}/`, BASE)).toBeNull();
  });

  it("refuses traversal", () => {
    expect(keyForPublicUrl(`${BASE}/../secret`, BASE)).toBeNull();
  });
});

describe("isPurgeable", () => {
  it("purges published and canceled posts at once", () => {
    for (const status of ["published", "canceled"] as PostStatus[]) {
      expect(isPurgeable(post({ status }), NOW)).toBe(true);
    }
  });

  it("keeps partial and failed media through the grace period, then releases it", () => {
    for (const status of ["partial", "failed"] as PostStatus[]) {
      const fresh = post({ status, settledAt: NOW.toISOString() });
      expect(isPurgeable(fresh, NOW)).toBe(false);
      const justUnder = new Date(NOW.getTime() + PURGE_GRACE_MS - 1000);
      expect(isPurgeable(fresh, justUnder)).toBe(false);
      const after = new Date(NOW.getTime() + PURGE_GRACE_MS);
      expect(isPurgeable(fresh, after)).toBe(true);
    }
  });

  it("never purges a post that still needs its media", () => {
    for (const status of ["draft", "scheduled", "publishing"] as PostStatus[]) {
      expect(isPurgeable(post({ status }), NOW)).toBe(false);
      expect(
        isPurgeable(post({ status }), new Date(NOW.getTime() + 10 * PURGE_GRACE_MS)),
      ).toBe(false);
    }
  });

  it("treats a missing settle time as due rather than keeping it forever", () => {
    expect(isPurgeable(post({ status: "failed", settledAt: null }), NOW)).toBe(true);
  });
});

describe("purgeMedia", () => {
  it("deletes a published post's objects and marks it", async () => {
    const s = store([post({ mediaUrls: [`${BASE}/u/w/a.mp4`, `${BASE}/u/w/b.jpg`] })]);
    const summary = await purgeMedia(s, { publicBaseUrl: BASE, now: () => NOW });

    expect(s.deleted).toEqual(["u/w/a.mp4", "u/w/b.jpg"]);
    expect(s.marked).toEqual(["p-1"]);
    expect(summary).toMatchObject({
      postsPurged: 1,
      objectsDeleted: 2,
      objectsFailed: 0,
      orphansDeleted: 0,
    });
  });

  it("leaves a post that is not due yet completely alone", async () => {
    const s = store([post({ status: "failed", settledAt: NOW.toISOString() })]);
    const summary = await purgeMedia(s, { publicBaseUrl: BASE, now: () => NOW });

    expect(s.deleted).toEqual([]);
    expect(s.marked).toEqual([]);
    expect(summary.postsPurged).toBe(0);
  });

  it("never deletes media the user merely linked to", async () => {
    const s = store([
      post({ mediaUrls: ["https://example.com/theirs.jpg", `${BASE}/u/w/ours.jpg`] }),
    ]);
    await purgeMedia(s, { publicBaseUrl: BASE, now: () => NOW });

    expect(s.deleted).toEqual(["u/w/ours.jpg"]);
    // Still marked: there is nothing further to do for this post.
    expect(s.marked).toEqual(["p-1"]);
  });

  it("marks a post whose media was entirely external, so it is not reconsidered forever", async () => {
    const s = store([post({ mediaUrls: ["https://example.com/theirs.jpg"] })]);
    const summary = await purgeMedia(s, { publicBaseUrl: BASE, now: () => NOW });

    expect(s.deleted).toEqual([]);
    expect(s.marked).toEqual(["p-1"]);
    expect(summary.postsPurged).toBe(1);
  });

  it("leaves a post unmarked when a delete fails, so the next sweep retries", async () => {
    const s = store([post({ mediaUrls: [`${BASE}/u/w/a.mp4`, `${BASE}/u/w/b.jpg`] })]);
    s.deleteObject = vi.fn(async (key: string) => {
      if (key.endsWith("b.jpg")) throw new Error("R2 down");
    });

    const summary = await purgeMedia(s, {
      publicBaseUrl: BASE,
      now: () => NOW,
      log: { error: () => {}, log: () => {} },
    });

    expect(s.marked).toEqual([]);
    expect(summary).toMatchObject({ objectsDeleted: 1, objectsFailed: 1, postsPurged: 0 });
  });

  it("keeps going across posts when one fails", async () => {
    const s = store([
      post({ id: "p-1", mediaUrls: [`${BASE}/u/w/bad.mp4`] }),
      post({ id: "p-2", mediaUrls: [`${BASE}/u/w/good.mp4`] }),
    ]);
    s.deleteObject = vi.fn(async (key: string) => {
      if (key.includes("bad")) throw new Error("nope");
    });

    const summary = await purgeMedia(s, {
      publicBaseUrl: BASE,
      now: () => NOW,
      log: { error: () => {}, log: () => {} },
    });

    expect(s.marked).toEqual(["p-2"]);
    expect(summary).toMatchObject({ postsPurged: 1, objectsFailed: 1 });
  });
});

describe("purgeMedia — media shared between posts", () => {
  it("never deletes an object another unfinished post still needs", async () => {
    // Exactly what happened live: a retry reused the media already in the
    // composer, so two posts referenced one object. Purging the finished one
    // must not pull the file out from under the other.
    const shared = `${BASE}/u/w/shared.mp4`;
    const s = store([
      post({ id: "done", status: "published", mediaUrls: [shared] }),
      post({ id: "waiting", status: "scheduled", mediaUrls: [shared], settledAt: null }),
    ]);

    const summary = await purgeMedia(s, { publicBaseUrl: BASE, now: () => NOW });

    expect(s.deleted).toEqual([]);
    // The finished post is still marked — it personally has nothing left to do.
    expect(s.marked).toEqual(["done"]);
    expect(summary.objectsRetained).toBe(1);
  });

  it("deletes the shared object once every post referencing it is done", async () => {
    const shared = `${BASE}/u/w/shared.mp4`;
    const s = store([
      post({ id: "a", status: "published", mediaUrls: [shared] }),
      post({ id: "b", status: "canceled", mediaUrls: [shared] }),
    ]);

    await purgeMedia(s, { publicBaseUrl: BASE, now: () => NOW });

    // Deleted exactly once, by whichever post got there first.
    expect(s.deleted).toEqual(["u/w/shared.mp4"]);
    expect(s.marked.sort()).toEqual(["a", "b"]);
  });
});

describe("purgeMedia — uploads that were never posted", () => {
  it("deletes an orphan once it is past the grace period", async () => {
    // The 109MB file found in the live bucket: uploaded, never attached to a
    // post, and therefore invisible to any per-post cleanup.
    const s = store([], [object("u/w/orphan.mp4", ORPHAN_GRACE_MS + 1000, 109_000_000)]);
    const summary = await purgeMedia(s, { publicBaseUrl: BASE, now: () => NOW });

    expect(s.deleted).toEqual(["u/w/orphan.mp4"]);
    expect(summary.orphansDeleted).toBe(1);
  });

  it("leaves a recent upload alone — someone may still be writing the caption", async () => {
    const s = store([], [object("u/w/fresh.mp4", 60_000)]);
    const summary = await purgeMedia(s, { publicBaseUrl: BASE, now: () => NOW });

    expect(s.deleted).toEqual([]);
    expect(summary.orphansDeleted).toBe(0);
  });

  it("never treats a scheduled post's media as an orphan, however old", async () => {
    const s = store(
      [post({ status: "scheduled", mediaUrls: [`${BASE}/u/w/pending.mp4`], settledAt: null })],
      [object("u/w/pending.mp4", 30 * ORPHAN_GRACE_MS)],
    );
    const summary = await purgeMedia(s, { publicBaseUrl: BASE, now: () => NOW });

    expect(s.deleted).toEqual([]);
    expect(summary.orphansDeleted).toBe(0);
  });

  it("keeps an object whose per-post delete failed, rather than double-counting it", async () => {
    const s = store(
      [post({ mediaUrls: [`${BASE}/u/w/a.mp4`] })],
      [object("u/w/a.mp4", ORPHAN_GRACE_MS + 1000)],
    );
    s.deleteObject = vi.fn(async () => {
      throw new Error("R2 down");
    });

    const summary = await purgeMedia(s, {
      publicBaseUrl: BASE,
      now: () => NOW,
      log: { error: () => {}, log: () => {} },
    });

    expect(s.marked).toEqual([]);
    expect(summary.orphansDeleted).toBe(0);
  });

  it("still reports post cleanup when listing storage fails", async () => {
    const s = store([post()]);
    s.listObjects = vi.fn(async () => {
      throw new Error("list failed");
    });

    const summary = await purgeMedia(s, {
      publicBaseUrl: BASE,
      now: () => NOW,
      log: { error: () => {}, log: () => {} },
    });

    expect(summary.postsPurged).toBe(1);
    expect(summary.orphansDeleted).toBe(0);
  });
});
