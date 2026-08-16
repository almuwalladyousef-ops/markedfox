import type { PostStatus } from "@/lib/publish/types";

// Deleting media once it has done its job.
//
// The platforms fetch media from our public URL at publish time and keep their
// own copy; ours is dead weight the moment the post is out. CLAUDE.md has said
// "media, deleted after publish" from the start — this is the part that
// actually does it. Without it storage only grows: two real posts had already
// left 109MB of a 10GB free tier behind.
//
// What is safe to delete, and when:
//
//   published, canceled   immediately — there is nothing left to retry
//   partial, failed       after a grace period, so the media survives long
//                         enough for the owner to try the post again
//   draft, scheduled,     never — the post still needs its media
//   publishing
//
// Only objects under our own public base are touched. A user who pasted a link
// to someone else's image has nothing here to delete, and we must never try.

export const PURGE_GRACE_MS = 24 * 60 * 60 * 1000;

/** Terminal states whose media is dead the moment they are reached. */
export const PURGE_IMMEDIATELY: readonly PostStatus[] = ["published", "canceled"];

/** Terminal states that keep their media for PURGE_GRACE_MS, in case of retry. */
export const PURGE_AFTER_GRACE: readonly PostStatus[] = ["partial", "failed"];

export const PURGEABLE_STATUSES: readonly PostStatus[] = [
  ...PURGE_IMMEDIATELY,
  ...PURGE_AFTER_GRACE,
];

export type PurgeablePost = {
  id: string;
  status: PostStatus;
  /** Every media URL on the post, ours and external alike. */
  mediaUrls: string[];
  /** When the post reached its terminal state. */
  settledAt: string | null;
};

export interface MediaPurgeStore {
  listPurgeable(limit: number): Promise<PurgeablePost[]>;
  deleteObject(key: string): Promise<void>;
  markPurged(postId: string, at: Date): Promise<void>;
}

export type PurgeSummary = {
  postsExamined: number;
  postsPurged: number;
  objectsDeleted: number;
  objectsFailed: number;
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
    limit?: number;
    log?: Pick<Console, "error" | "log">;
  },
): Promise<PurgeSummary> {
  const now = options.now ?? (() => new Date());
  const graceMs = options.graceMs ?? PURGE_GRACE_MS;
  const log = options.log ?? console;

  const posts = await store.listPurgeable(options.limit ?? 50);
  const summary: PurgeSummary = {
    postsExamined: posts.length,
    postsPurged: 0,
    objectsDeleted: 0,
    objectsFailed: 0,
  };

  for (const post of posts) {
    if (!isPurgeable(post, now(), graceMs)) continue;

    const keys = post.mediaUrls
      .map((url) => keyForPublicUrl(url, options.publicBaseUrl))
      .filter((key): key is string => key !== null);

    let allDeleted = true;
    for (const key of keys) {
      try {
        await store.deleteObject(key);
        summary.objectsDeleted += 1;
      } catch (error) {
        // Leave the post unmarked so the next sweep tries again rather than
        // silently abandoning the bytes.
        allDeleted = false;
        summary.objectsFailed += 1;
        log.error(
          `purge: could not delete ${key} — ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // A post whose media was all external has nothing to delete but should
    // still be marked, or the sweep reconsiders it forever.
    if (allDeleted) {
      try {
        await store.markPurged(post.id, now());
        summary.postsPurged += 1;
        if (keys.length > 0) {
          log.log(`purge: released ${keys.length} object(s) from post ${post.id}`);
        }
      } catch (error) {
        log.error(
          `purge: deleted objects but could not mark post ${post.id} — ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  return summary;
}
