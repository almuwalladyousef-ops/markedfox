import { canUserDo } from "@/lib/entitlements/can-user-do";
import type { EntitlementSnapshot } from "@/lib/entitlements/types";
import {
  isRateLimited,
  PlatformBudgetError,
  requestBudget,
  type BudgetStore,
} from "@/lib/platforms/budget";
import { PlatformApiError, PlatformAuthError } from "@/lib/platforms/errors";
import { getPlatform } from "@/lib/platforms/registry";
import type { Platform, PlatformAdapter } from "@/lib/platforms/types";

import { containsExternalLink } from "./links";
import type {
  PostRow,
  PublishReport,
  PublishStore,
  TargetConnection,
  TargetFailureCode,
  TargetOutcome,
} from "./types";
import { validateOptionsFor } from "./specs";
import { validateContent } from "./validate";

// Publishes one post to every target it names and records what happened.
//
// This is the one code path for "publish now" (API route, user's client) and
// the scheduler (service-role client): both hand in an already-claimed row
// whose status is `publishing`. Per target, in order: resolve the connection,
// validate the content against that platform's rules, ask canUserDo, fetch
// fresh tokens, call the adapter. Every target gets a history row; the post
// gets one usage row if anything went out, plus one x_post row per X account
// that did; the row's status ends as published / partial / failed.
//
// Nothing here imports server-only modules — the store is injected — so the
// exit criteria (partial failure reported precisely, X links refused, the
// 301st X post refused, plan-locked platforms refused by API) are proven by
// unit tests with fake adapters and an in-memory store, not by discipline.

export type PublishDeps = {
  store: PublishStore;
  /** Adapter lookup, injectable so tests can register fakes. */
  getAdapter?: (platform: Platform) => PlatformAdapter;
  /** The shared per-app rate-limit budget. Omitted = unmetered, which is right
   *  for "post now" (the user is watching, and should get the platform's own
   *  answer) and wrong for the scheduler, where a burst of a hundred posts
   *  would otherwise spend an allowance every tenant shares. */
  budget?: BudgetStore;
  now?: () => Date;
  log?: Pick<Console, "error" | "warn">;
};

const MAX_LAST_ERROR = 1000;

// How long a post waits after being held back by the shared rate-limit budget.
// Long enough that the retry does not itself become the burst, short enough
// that a scheduled post is still roughly on time.
const RATE_LIMIT_RETRY_MS = 2 * 60_000;

export async function publishPost(
  deps: PublishDeps,
  post: PostRow,
): Promise<PublishReport> {
  const { store } = deps;
  const getAdapter = deps.getAdapter ?? getPlatform;
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? console;

  const targets = await store.loadTargets(post);
  const byId = new Map(targets.map((t) => [t.id, t]));

  // One snapshot for the whole post. Counters that this post itself moves are
  // bumped locally below, so two X targets in one post cannot both pass on a
  // budget with one slot left.
  const snapshot = cloneSnapshot(
    await store.loadSnapshot(post.user_id, post.workspace_id),
  );

  const outcomes: TargetOutcome[] = [];

  for (const connectionId of post.target_connection_ids) {
    const connection = byId.get(connectionId);
    if (!connection) {
      // Deleted or never the user's — the store filters by owner, so an id
      // that comes back missing is refused without ever being looked up again.
      outcomes.push(
        failed(connectionId, null, null, "connection_missing",
          "That account is no longer connected."),
      );
      continue;
    }

    outcomes.push(await publishTarget(connection));
  }

  async function publishTarget(connection: TargetConnection): Promise<TargetOutcome> {
    const { platform } = connection;
    const name = connection.platform_account_name;

    if (connection.status !== "active") {
      return failed(connection.id, platform, name, "connection_inactive",
        `Reconnect ${name ?? platform} — its access has ${connection.status === "expired" ? "expired" : "been revoked"}.`);
    }

    let adapter: PlatformAdapter;
    try {
      adapter = getAdapter(platform);
    } catch {
      return failed(connection.id, platform, name, "adapter_missing",
        `${platform} publishing is not available yet.`);
    }

    const override = post.platform_overrides[platform];
    const caption = override?.caption ?? post.caption;
    const issues = validateContent(
      { id: adapter.id, displayName: adapter.displayName, capabilities: adapter.capabilities, rules: adapter.rules },
      { caption, media: post.media },
    ).map((i) => i.message);
    // Per-platform options (TikTok's privacy level and toggles) are checked
    // the same way content is: createPost refused them already, this is the
    // publish-time echo for rows that reached the queue another way.
    issues.push(
      ...validateOptionsFor(adapter, override?.options, null, {
        hasVideo: post.media.some((m) => m.type === "video"),
      }),
    );
    if (issues.length > 0) {
      return failed(connection.id, platform, name, "invalid_content", issues.join(" "));
    }

    // The plan gate, at publish time — not only at submission. A post scheduled
    // on Pro and due after a downgrade to Free is judged by Free's limits.
    const decision = canUserDo(snapshot, {
      type: "publish_post",
      platform,
      hasExternalLink: containsExternalLink(caption),
    });
    if (!decision.allowed) {
      return failed(connection.id, platform, name, decision.code, decision.reason);
    }

    // The shared budget, asked for AFTER the plan gate so a denied post never
    // spends from an allowance every tenant draws on.
    if (deps.budget) {
      const permit = await requestBudget(deps.budget, platform);
      if (!permit.allowed) {
        // Retryable: the row goes back to the queue, not to the user as an
        // error. Nothing is wrong except the clock.
        return failed(
          connection.id, platform, name, "rate_limited",
          `${platform} is at its shared rate limit; retrying in about ${permit.retryAfterSeconds}s`,
          true,
        );
      }
    }

    try {
      const tokens = await store.getTokens(connection.id);
      const result = await adapter.publish({
        caption,
        media: post.media,
        tokens,
        platformAccountId: connection.platform_account_id,
        options: override?.options,
      });

      if (platform === "x") snapshot.usage.xPostsThisMonth += 1;

      return {
        connectionId: connection.id,
        platform,
        accountName: name,
        outcome: "published",
        platformPostId: result.platformPostId,
        postUrl: result.url,
      };
    } catch (error) {
      if (error instanceof PlatformAuthError) {
        // A dead grant is a state change: record it so the dashboard says
        // "reconnect" instead of every future publish failing the same way.
        await store.markConnectionExpired(connection.id).catch((e) =>
          log.error(`publish: could not mark connection ${connection.id} expired`, e),
        );
        return failed(connection.id, platform, name, "auth_error",
          `${name ?? platform} needs to be reconnected: ${error.message}`);
      }
      if (error instanceof PlatformBudgetError) {
        return failed(connection.id, platform, name, "rate_limited", error.message, true);
      }
      if (error instanceof PlatformApiError) {
        // A platform that actually throttled us is app-wide news: record it so
        // every other worker stops asking before the platform escalates.
        if (deps.budget && isRateLimited(error.status ?? 0, error.message)) {
          await deps.budget
            .throttle(platform, error.retryAfterSeconds ?? 300, error.message)
            .catch((e) => log.error(`publish: could not record ${platform} throttle`, e));
        }
        return failed(connection.id, platform, name, "platform_error",
          error.message, error.retryable);
      }
      log.error(`publish: unexpected error on ${platform} ${connection.id}`, error);
      return failed(connection.id, platform, name, "unexpected_error",
        error instanceof Error ? error.message : "Unexpected error");
    }
  }

  // ── record ────────────────────────────────────────────────────────────
  const at = now();
  const published = outcomes.filter((o) => o.outcome === "published");

  for (const outcome of outcomes) {
    // A vanished connection has no platform to file history under; the report
    // and last_error still name it.
    if (outcome.platform === null) continue;
    await store
      .recordHistory({
        userId: post.user_id,
        workspaceId: post.workspace_id,
        postId: post.id,
        connectionId: outcome.connectionId,
        platform: outcome.platform,
        outcome: outcome.outcome,
        platformPostId: outcome.outcome === "published" ? outcome.platformPostId : undefined,
        postUrl: outcome.outcome === "published" ? outcome.postUrl : undefined,
        error: outcome.outcome === "failed" ? outcome.error : undefined,
        detail:
          outcome.outcome === "failed"
            ? { code: outcome.code, retryable: outcome.retryable }
            : {},
        postedAt: at,
      })
      .catch((e) => log.error(`publish: history write failed for post ${post.id}`, e));
  }

  // Usage is written after the platforms were called: the caps are on what
  // actually went out, and a post that failed everywhere must not burn a slot.
  // These writes cannot be rolled back if they fail — the post is already
  // public — so failures are logged loudly and the report still returns.
  if (published.length > 0) {
    await store
      .recordUsage({
        userId: post.user_id,
        workspaceId: post.workspace_id,
        kind: "post_publish",
        refId: post.id,
        metadata: { platforms: published.map((p) => p.platform) },
      })
      .catch((e) => log.error(`publish: USAGE WRITE FAILED post_publish ${post.id}`, e));

    for (const target of published.filter((p) => p.platform === "x")) {
      await store
        .recordUsage({
          userId: post.user_id,
          workspaceId: post.workspace_id,
          kind: "x_post",
          platform: "x",
          refId: post.id,
          metadata: { connection_id: target.connectionId },
        })
        .catch((e) => log.error(`publish: USAGE WRITE FAILED x_post ${post.id} — this is a billed post`, e));
    }
  }

  const failures = outcomes.filter(
    (o): o is Extract<TargetOutcome, { outcome: "failed" }> => o.outcome === "failed",
  );

  // Nothing went out, and the ONLY reason was the shared per-app rate limit.
  // That is not a failed post — it is a post that has not been tried yet, and
  // telling the user it failed would make the burst protection look like data
  // loss. Back to the queue, at the time the budget says to come back.
  const rateLimitedOnly =
    published.length === 0 &&
    failures.length === outcomes.length &&
    outcomes.length > 0 &&
    failures.every((f) => f.code === "rate_limited");

  const status: PublishReport["status"] = rateLimitedOnly
    ? "deferred"
    : published.length === outcomes.length && outcomes.length > 0
      ? "published"
      : published.length > 0
        ? "partial"
        : "failed";

  const lastError = failures
    .map((o) => `${o.platform ?? "unknown"}${o.accountName ? ` (${o.accountName})` : ""}: ${o.error}`)
    .join("; ")
    .slice(0, MAX_LAST_ERROR);

  if (status === "deferred") {
    await store.finishPost(post, {
      status: "scheduled",
      publishedAt: null,
      lastError: lastError || null,
      retryAt: new Date(at.getTime() + RATE_LIMIT_RETRY_MS),
    });
  } else {
    await store.finishPost(post, {
      status,
      publishedAt: published.length > 0 ? at : null,
      lastError: lastError || null,
    });
  }

  return { postId: post.id, status, targets: outcomes };
}

function failed(
  connectionId: string,
  platform: Platform | null,
  accountName: string | null,
  code: TargetFailureCode,
  error: string,
  retryable = false,
): TargetOutcome {
  return { connectionId, platform, accountName, outcome: "failed", code, error, retryable };
}

function cloneSnapshot(snapshot: EntitlementSnapshot): EntitlementSnapshot {
  return { ...snapshot, usage: { ...snapshot.usage } };
}
