import type {
  Action,
  Decision,
  DenialCode,
  EntitlementSnapshot,
  PlanLimits,
} from "./types";
import type { Platform } from "@/lib/platforms/types";

// The pricing table as an enforceable pure function. No I/O: callers build an
// EntitlementSnapshot (see snapshot.ts) and every route, job, and webhook asks
// this before acting. UI lock states derive from the same calls, so the API
// can never be more permissive than the composer.

function deny(code: DenialCode, reason: string): Decision {
  return { allowed: false, code, reason };
}

function platformAllowed(limits: PlanLimits, platform: Platform): boolean {
  if (platform === "x" && limits.xPostsPerMonth <= 0) return false;
  if (limits.platforms === null) return true;
  return limits.platforms.includes(platform);
}

export function canUserDo(
  snapshot: EntitlementSnapshot,
  action: Action,
): Decision {
  const { limits, usage } = snapshot;

  switch (action.type) {
    case "connect_platform": {
      if (!platformAllowed(limits, action.platform)) {
        return deny(
          "plan_platform_locked",
          `The ${snapshot.planId} plan does not include ${action.platform}`,
        );
      }
      // The Free-plan lever since 2026-08-16: every platform is connectable on
      // every plan, and it is the number of connected accounts that is capped.
      // Per workspace, not pooled: a Free user with two workspaces gets three
      // accounts in each.
      if (
        limits.maxConnectedAccountsPerWorkspace !== null &&
        usage.connectedAccountsInWorkspace >=
          limits.maxConnectedAccountsPerWorkspace
      ) {
        return deny(
          "connected_accounts_cap",
          `The ${snapshot.planId} plan connects up to ${limits.maxConnectedAccountsPerWorkspace} accounts per workspace. Disconnect one, use another workspace, or upgrade.`,
        );
      }
      return { allowed: true };
    }

    case "publish_post": {
      if (!platformAllowed(limits, action.platform)) {
        return deny(
          "plan_platform_locked",
          `The ${snapshot.planId} plan does not include ${action.platform}`,
        );
      }
      if (action.platform === "x") {
        if (usage.xPostsThisMonth >= limits.xPostsPerMonth) {
          return deny(
            "x_monthly_cap",
            `X posts are capped at ${limits.xPostsPerMonth} per month`,
          );
        }
        // Server-side URL block: $0.20 with a link vs $0.015 without. This is
        // a cost control, never a UI-only check.
        if (action.hasExternalLink && !limits.xLinksAllowed) {
          return deny(
            "x_links_blocked",
            "Posts to X cannot contain external links",
          );
        }
      }
      if (
        limits.postsPerDay !== null &&
        usage.postsToday >= limits.postsPerDay
      ) {
        return deny(
          "posts_daily_cap",
          `Posts are capped at ${limits.postsPerDay} per day on the ${snapshot.planId} plan`,
        );
      }
      return { allowed: true };
    }

    case "create_workspace": {
      if (
        limits.maxWorkspaces !== null &&
        usage.workspaceCount >= limits.maxWorkspaces
      ) {
        return deny(
          "workspace_cap",
          `The ${snapshot.planId} plan includes ${limits.maxWorkspaces} workspaces. Upgrade for more.`,
        );
      }
      return { allowed: true };
    }

    case "create_dm_rule": {
      if (limits.dmRulesMax !== null && usage.dmRuleCount >= limits.dmRulesMax) {
        return deny(
          "dm_rule_cap",
          `DM rules are capped at ${limits.dmRulesMax} on the ${snapshot.planId} plan`,
        );
      }
      return { allowed: true };
    }

    case "send_dm": {
      if (usage.dmSendsThisMonth >= limits.dmSendsPerMonth) {
        return deny(
          "dm_send_cap",
          `DM sends are capped at ${limits.dmSendsPerMonth} per month`,
        );
      }
      return { allowed: true };
    }

    case "upload_video": {
      if (
        usage.videoMinutesThisMonth + action.minutes >
        limits.videoUploadMinutesPerMonth
      ) {
        return deny(
          "video_minutes_cap",
          `Video uploads are capped at ${limits.videoUploadMinutesPerMonth} minutes per month`,
        );
      }
      return { allowed: true };
    }

    case "use_research": {
      if (limits.researchCreditsPerMonth <= 0) {
        return deny(
          "research_locked",
          `Research is not included in the ${snapshot.planId} plan`,
        );
      }
      return { allowed: true };
    }

    case "track_research_source": {
      if (limits.researchCreditsPerMonth <= 0) {
        return deny(
          "research_locked",
          `Research is not included in the ${snapshot.planId} plan`,
        );
      }
      if (
        limits.researchSourcesMax !== null &&
        usage.researchSourceCount >= limits.researchSourcesMax
      ) {
        return deny(
          "research_sources_cap",
          `The ${snapshot.planId} plan tracks up to ${limits.researchSourcesMax} channels`,
        );
      }
      return { allowed: true };
    }

    case "spend_research_credits": {
      if (limits.researchCreditsPerMonth <= 0) {
        return deny(
          "research_locked",
          `Research is not included in the ${snapshot.planId} plan`,
        );
      }
      if (
        usage.researchCreditsThisMonth + action.credits >
        limits.researchCreditsPerMonth
      ) {
        return deny(
          "research_credits_cap",
          `Research credits are capped at ${limits.researchCreditsPerMonth} per month`,
        );
      }
      return { allowed: true };
    }

    case "use_funnels": {
      if (!limits.funnels) {
        return deny(
          "funnels_locked",
          `Funnels are not included in the ${snapshot.planId} plan`,
        );
      }
      return { allowed: true };
    }
  }
}
