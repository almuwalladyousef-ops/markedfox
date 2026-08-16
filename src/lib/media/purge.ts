import type { PostStatus } from "@/lib/publish/types";

// Deleting media once it has done its job.
//
// The platforms fetch media from our public URL at publish time and keep their
// own copy; ours is dead weight the moment the post is out. CLAUDE.md has said
// "media, deleted after publish" from the start — this is the part that
// actually does it.
//
// There are two ways bytes are left behind, and the first sweep only caught
// one of them. Both were found on live data:
//
//   1. A post finished and nobody deleted its media. Two real posts had left
//      109MB in a 10GB free tier.
//   2. Someone uploaded a file and never posted it. That object belongs to no
//      post, so no amount of per-post cleanup will ever touch it — and this is
//      the worse leak, because an abandoned upload is invisible.
//
// A third case turned up the moment cleanup ran: two posts referencing the
// SAME object, because retrying a post reuses the media already in the
// composer. Purging one deleted a file the other still pointed at. Harmless
// that time; fatal for a scheduled post that had not gone out yet. So nothing
// is deleted while any unpurged post still needs it.
//
// What is safe to delete, and when:
//
//   published, canceled   at once — there is nothing left to retry
//   partial, failed       after a grace period, so media outlives a retry
//   draft, scheduled,     never — the post still needs it
//   publishing
//   attached to nothing   after a longer grace, in case it is mid-compose

export const PURGE_GRACE_MS = 24 * 60 * 60 * 1000;

// Longer than the post grace on purpose: an upload sits unattached for as long
// as someone takes to write the caption and press the button, and deleting a
// file out from under a half-written post is worse than storing it a day
// longer.
export const ORPHAN_GRACE_MS = 48 * 60 * 60 * 1000;

/** Terminal states whose media is dead the moment they are reached. */
export const PURGE_IMMEDIATELY: readonly PostStatus[] = ["published", "canceled"];

/** Terminal states that keep their media for PURGE_GRACE_MS, in case of retry. */
export const PURGE_AFTER_GRACE: readonly PostStatus[] = ["partial", "failed"];

export type PurgeablePost = {
  id: string;
  status: PostStatus;
  /** Every media URL on the post, ours and external alike. */
  mediaUrls: string[];
  /** When the post reached its terminal state. */
  settledAt: string | null;
};

export type StoredObject = {
  key: string;
  uploadedAt: Date;
  sizeBytes: number;
};

export interface MediaPurgeStore {
  /** Every post whose media has not been released yet, any status. */
  listUnpurgedPosts(limit: number): Promise<PurgeablePost[]>;
  /** Everything currently in the bucket. */
  listObjects(): Promise<StoredObject[]>;
  deleteObject(key: string): Promise<void>;
  markPurged(postId: string, at: Date): Promise<void>;
}

export type PurgeSummary = {
  postsPurged: number;
  objectsDeleted: number;
  orphansDeleted: number;
  objectsFailed: number;
  /** Objects kept because another post still references them. */
  objectsRetained: number;
};

// The object key behind one of our public URLs, or null when the URL is not
// ours. Exact prefix match on purpose: a lookalike host must not resolve to a
// key we would then try to delete.
export function keyForPublicUrl(
  url: string,
  publicBaseUrl: string,
): string | null {
  const base = publicBaseUrl.replace(/\/+$/, "") + "/";
  if (!url.startsWith(base)) return null;
  const key = url.slice(base.length);
  if (!key || key.includes("..")) return null;
  try {
    return decodeURIComponent(key);
  } catch {
    return null;
  }
}

export function isPurgeable(
  post: PurgeablePost,
  now: Date,
  graceMs = PURGE_GRACE_MS,
): boolean {
  if (PURGE_IMMEDIATELY.includes(post.status)) return true;
  if (!PURGE_AFTER_GRACE.includes(post.status)) return false;
  // No settle time recorded: treat it as due rather than keeping it forever.
  if (!post.settledAt) return true;
  return now.getTime() - new Date(post.settledAt).getTime() >= graceMs;
}

export async function purgeMedia(
  store: MediaPurgeStore,
  options: {
    publicBaseUrl: string;
    now?: () => Date;
    graceMs?: number;
    orphanGraceMs?: number;
    limit?: number;
    log?: Pick<Console, "error" | "log">;
  },
): Promise<PurgeSummary> {
  const now = options.now ?? (() => new Date());
  const graceMs = options.graceMs ?? PURGE_GRACE_MS;
  const orphanGraceMs = options.orphanGraceMs ?? ORPHAN_GRACE_MS;
  const log = options.log ?? console;

  const summary: PurgeSummary = {
    postsPurged: 0,
    objectsDeleted: 0,
    orphansDeleted: 0,
    objectsFailed: 0,
    objectsRetained: 0,
  };

  const posts = await store.listUnpurgedPosts(options.limit ?? 200);
  const at = now();
  const keysOf = (post: PurgeablePost): string[] =>
    post.mediaUrls
      .map((url) => keyForPublicUrl(url, options.publicBaseUrl))
      .filter((key): key is string => key !== null);

  const purgeable = posts.filter((post) => isPurgeable(post, at, graceMs));
  const notPurgeable = posts.filter((post) => !purgeable.includes(post));

  // Anything a post still needs — because it has not gone out yet, or is
  // inside its retry grace — is off limits no matter who else references it.
  const stillNeeded = new Set(notPurgeable.flatMap(keysOf));

  // Posts that end this run still holding their media, so the orphan pass
  // does not delete objects the per-post pass deliberately kept.
  const unreleased = new Set(stillNeeded);

  // Two finished posts can reference one object — a retry reuses whatever is
  // already in the composer. Deleting it twice is harmless but pointless, and
  // the second call spends a request against the same rate limit.
  const alreadyDeleted = new Set<string>();

  // ── pass 1: posts that are done with their media ──────────────────────
  for (const post of purgeable) {
    let allDeleted = true;

    for (const key of keysOf(post)) {
      if (stillNeeded.has(key)) {
        // Shared with a post that is not finished. Leave the object; this post
        // is still marked, because it personally has nothing left to do.
        summary.objectsRetained += 1;
        continue;
      }
      if (alreadyDeleted.has(key)) continue;

      try {
        await store.deleteObject(key);
        alreadyDeleted.add(key);
        summary.objectsDeleted += 1;
      } catch (error) {
        // Leave the post unmarked so the next sweep tries again rather than
        // silently abandoning the bytes.
        allDeleted = false;
        unreleased.add(key);
        summary.objectsFailed += 1;
        log.error(
          `purge: could not delete ${key} — ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (allDeleted) {
      try {
        await store.markPurged(post.id, at);
        summary.postsPurged += 1;
      } catch (error) {
        log.error(
          `purge: deleted objects but could not mark post ${post.id} — ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  // ── pass 2: objects no post has ever claimed ──────────────────────────
  // An upload that was never posted has no row to hang cleanup off, so the
  // bucket itself is the only place it can be found.
  let objects: StoredObject[];
  try {
    objects = await store.listObjects();
  } catch (error) {
    log.error(
      `purge: could not list storage — ${error instanceof Error ? error.message : String(error)}`,
    );
    return summary;
  }

  for (const object of objects) {
    if (unreleased.has(object.key)) continue;
    if (at.getTime() - object.uploadedAt.getTime() < orphanGraceMs) continue;

    try {
      await store.deleteObject(object.key);
      summary.orphansDeleted += 1;
      log.log(
        `purge: released orphan ${object.key} (${Math.round(object.sizeBytes / 1024)}KB, never posted)`,
      );
    } catch (error) {
      summary.objectsFailed += 1;
      log.error(
        `purge: could not delete orphan ${object.key} — ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return summary;
}
