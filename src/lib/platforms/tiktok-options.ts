// TikTok Direct Post options — the part of the TikTok integration the
// Content Posting API audit reads most closely.
//
// TikTok's UX rules for third-party posting (their "integration guidelines"
// for Direct Post) are specific and checked by a human reviewer:
//   - query creator_info first and show WHO the post goes to (nickname);
//   - the privacy level is a dropdown fed from creator_info's
//     privacy_level_options, with NO preselected value — the user chooses;
//   - comment / duet / stitch are opt-IN toggles, off by default, and greyed
//     out when creator_info says the creator has them disabled;
//   - commercial-content disclosure: a toggle that reveals "Your brand" and
//     "Branded content"; if on, at least one must be picked; branded content
//     cannot be posted with private visibility;
//   - the consent line names TikTok's Music Usage Confirmation (and the
//     Branded Content Policy when branded content is on);
//   - after posting, say the post is processing and may take a while.
//
// This file is pure — no I/O, no env — so the composer (client) and the
// adapter + API (server) validate with the same function and the same words.

export type TikTokCreatorContext = {
  creatorUsername?: string;
  creatorNickname?: string;
  creatorAvatarUrl?: string;
  /** The only privacy levels this creator may post with, per TikTok. */
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSec?: number;
};

/**
 * How the video reaches TikTok. "direct" posts it to the profile
 * (video.publish). "inbox" sends it to the creator's TikTok inbox as a draft
 * they finish and post inside the TikTok app (video.upload). Missing means
 * direct, which is what every post made before this option existed did.
 */
export type TikTokPostMode = "direct" | "inbox";

export type TikTokPublishOptions = {
  post_mode?: TikTokPostMode;
  privacy_level?: string;
  allow_comment?: boolean;
  allow_duet?: boolean;
  allow_stitch?: boolean;
  disclose_commercial?: boolean;
  /** "Your brand" — the creator is promoting themselves or their own business. */
  brand_organic?: boolean;
  /** "Branded content" — paid partnership with a third party. */
  brand_content?: boolean;
  is_aigc?: boolean;
};

export const TIKTOK_PRIVACY_LABELS: Record<string, string> = {
  PUBLIC_TO_EVERYONE: "Everyone",
  MUTUAL_FOLLOW_FRIENDS: "Friends",
  FOLLOWER_OF_CREATOR: "Followers",
  SELF_ONLY: "Only you",
};

export const TIKTOK_MUSIC_USAGE_URL =
  "https://www.tiktok.com/legal/page/global/music-usage-confirmation/en";
export const TIKTOK_BRANDED_CONTENT_POLICY_URL =
  "https://www.tiktok.com/legal/page/global/bc-policy/en";

const BOOLEAN_KEYS = [
  "allow_comment",
  "allow_duet",
  "allow_stitch",
  "disclose_commercial",
  "brand_organic",
  "brand_content",
  "is_aigc",
] as const;

// Picks the known keys out of whatever arrived (a request body, a jsonb
// column) with the right types; anything else is dropped silently.
export function parseTikTokOptions(raw: unknown): TikTokPublishOptions {
  if (typeof raw !== "object" || raw === null) return {};
  const source = raw as Record<string, unknown>;
  const out: TikTokPublishOptions = {};
  if (source.post_mode === "direct" || source.post_mode === "inbox") {
    out.post_mode = source.post_mode;
  }
  if (typeof source.privacy_level === "string" && source.privacy_level) {
    out.privacy_level = source.privacy_level;
  }
  for (const key of BOOLEAN_KEYS) {
    if (typeof source[key] === "boolean") out[key] = source[key] as boolean;
  }
  return out;
}

// The context TikTok reports for this creator, parsed from creator_info.
export function parseCreatorContext(data: Record<string, unknown> | undefined): TikTokCreatorContext {
  const d = data ?? {};
  const options = Array.isArray(d.privacy_level_options)
    ? (d.privacy_level_options as unknown[]).filter((o): o is string => typeof o === "string")
    : [];
  return {
    creatorUsername: typeof d.creator_username === "string" ? d.creator_username : undefined,
    creatorNickname: typeof d.creator_nickname === "string" ? d.creator_nickname : undefined,
    creatorAvatarUrl: typeof d.creator_avatar_url === "string" ? d.creator_avatar_url : undefined,
    privacyLevelOptions: options,
    commentDisabled: d.comment_disabled === true,
    duetDisabled: d.duet_disabled === true,
    stitchDisabled: d.stitch_disabled === true,
    maxVideoPostDurationSec:
      typeof d.max_video_post_duration_sec === "number" ? d.max_video_post_duration_sec : undefined,
  };
}

// Every reason a TikTok post cannot go out with these options. Runs in the
// composer as the user chooses (with the live creator context) and again on
// the server at create time (context may be absent there — the adapter
// re-checks against a fresh creator_info at publish).
export function validateTikTokOptions(
  options: TikTokPublishOptions,
  context?: TikTokCreatorContext | null,
  input: { hasVideo?: boolean } = {},
): string[] {
  const issues: string[] = [];

  // A draft sent to the TikTok inbox carries none of these choices. The
  // creator makes them in the TikTok app when they post it, so there is
  // nothing here to refuse.
  if (options.post_mode === "inbox") return issues;

  if (!options.privacy_level) {
    issues.push("Choose who can see this TikTok post.");
  } else if (
    context &&
    context.privacyLevelOptions.length > 0 &&
    !context.privacyLevelOptions.includes(options.privacy_level)
  ) {
    issues.push(
      `TikTok does not allow "${TIKTOK_PRIVACY_LABELS[options.privacy_level] ?? options.privacy_level}" for this account right now.`,
    );
  }

  if (options.disclose_commercial && !options.brand_organic && !options.brand_content) {
    issues.push(
      "You turned on commercial content disclosure — pick “Your brand”, “Branded content”, or both.",
    );
  }
  if (options.brand_content && options.privacy_level === "SELF_ONLY") {
    issues.push(
      "Branded content cannot be private on TikTok — choose a visibility other than “Only you”.",
    );
  }

  if (context) {
    if (options.allow_comment && context.commentDisabled) {
      issues.push("This TikTok account has comments turned off; they cannot be allowed here.");
    }
    if (input.hasVideo !== false) {
      if (options.allow_duet && context.duetDisabled) {
        issues.push("This TikTok account has duets turned off; they cannot be allowed here.");
      }
      if (options.allow_stitch && context.stitchDisabled) {
        issues.push("This TikTok account has stitches turned off; they cannot be allowed here.");
      }
    }
  }

  return issues;
}

// The consent sentence TikTok requires beside the post button.
export function tiktokConsentText(options: TikTokPublishOptions): {
  prefix: string;
  links: { label: string; href: string }[];
} {
  const links = [{ label: "Music Usage Confirmation", href: TIKTOK_MUSIC_USAGE_URL }];
  if (options.brand_content) {
    links.unshift({ label: "Branded Content Policy", href: TIKTOK_BRANDED_CONTENT_POLICY_URL });
  }
  return { prefix: "By posting, you agree to TikTok's", links };
}
