import type { EntitlementSnapshot } from "@/lib/entitlements/types";
import type {
  ConnectionTokens,
  MediaRef,
  Platform,
  PublishResult,
} from "@/lib/platforms/types";
import type { UsageKind } from "@/lib/usage/record";

// Shapes shared by the publish orchestrator, its Supabase store, the API
// route, and the composer. No I/O here.

export type PostStatus =
  | "draft"
  | "scheduled"
  | "publishing"
  | "published"
  | "partial"
  | "failed"
  | "canceled";

export type PlatformOverrides = Partial<Record<Platform, { caption?: string }>>;

// A scheduled_posts row as the orchestrator needs it. `media` and
// `platform_overrides` are jsonb in the database; the store parses them into
// these shapes so nothing downstream handles unknown.
export type PostRow = {
  id: string;
  user_id: string;
  workspace_id: string;
  caption: string;
  media: MediaRef[];
  platform_overrides: PlatformOverrides;
  target_connection_ids: string[];
  status: PostStatus;
  scheduled_for: string | null;
  published_at: string | null;
  attempt_count: number;
  last_error: string | null;
  created_at: string;
};

export type TargetConnection = {
  id: string;
  user_id: string;
  workspace_id: string;
  platform: Platform;
  platform_account_id: string;
  platform_account_name: string | null;
  status: "active" | "expired" | "revoked" | "error";
};

// Everything the orchestrator asks of persistence. The real implementation
// (store.ts) is Supabase behind the caller's client — the user's client in the
// API path so RLS applies, the service-role client in the scheduler with
// explicit filters. Tests hand in an in-memory one.
export interface PublishStore {
  /** The post's targets, filtered to the post's own user and workspace. */
  loadTargets(post: PostRow): Promise<TargetConnection[]>;
  loadSnapshot(userId: string, workspaceId: string): Promise<EntitlementSnapshot>;
  /** Fresh tokens — refreshed and persisted first when expiry is near. */
  getTokens(connectionId: string): Promise<ConnectionTokens>;
  markConnectionExpired(connectionId: string): Promise<void>;
  recordHistory(entry: HistoryEntry): Promise<void>;
  recordUsage(entry: UsageEntry): Promise<void>;
  finishPost(
    post: PostRow,
    result: { status: PostStatus; publishedAt: Date | null; lastError: string | null },
  ): Promise<void>;
}

export type HistoryEntry = {
  userId: string;
  workspaceId: string;
  postId: string;
  connectionId: string;
  platform: Platform;
  outcome: "published" | "failed";
  platformPostId?: string;
  postUrl?: string;
  error?: string;
  detail: Record<string, unknown>;
  postedAt: Date;
};

export type UsageEntry = {
  userId: string;
  workspaceId: string;
  kind: UsageKind;
  platform?: Platform;
  refId: string;
  metadata?: Record<string, unknown>;
};

// Why a target did not publish. Content and plan codes come straight from
// validate.ts and canUserDo; the rest name the failure precisely enough for
// the composer to tell the user what to do (reconnect, retry, remove a link).
export type TargetFailureCode =
  | "connection_missing"
  | "connection_inactive"
  | "adapter_missing"
  | "invalid_content"
  | "plan_platform_locked"
  | "connected_accounts_cap"
  | "workspace_cap"
  | "posts_daily_cap"
  | "x_monthly_cap"
  | "x_links_blocked"
  | "dm_rule_cap"
  | "dm_send_cap"
  | "video_minutes_cap"
  | "funnels_locked"
  | "auth_error"
  | "platform_error"
  | "unexpected_error";

export type TargetOutcome = {
  connectionId: string;
  /** null only when the connection no longer exists, so its platform is unknown. */
  platform: Platform | null;
  accountName: string | null;
} & (
  | { outcome: "published"; platformPostId: string; postUrl?: string }
  | { outcome: "failed"; code: TargetFailureCode; error: string; retryable: boolean }
);

export type PublishReport = {
  postId: string;
  status: "published" | "partial" | "failed";
  targets: TargetOutcome[];
};

export type { PublishResult };
