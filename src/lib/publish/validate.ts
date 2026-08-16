import type {
  ContentRules,
  MediaRef,
  Platform,
  PlatformCapabilities,
} from "@/lib/platforms/types";

// Per-platform content validation, pure and shared.
//
// The composer runs this in the browser on every keystroke and the API runs
// it again on the server before writing a row — the same function over the
// same data, so a post the composer says is fine is fine at the API and vice
// versa. Nothing here does I/O or reads env, which is what lets a client
// component import it.
//
// The rules and capabilities come from each adapter (one file per platform):
// this module owns only the checks, never the numbers.

export type PlatformContentSpec = {
  id: Platform;
  displayName: string;
  capabilities: PlatformCapabilities;
  rules: ContentRules;
};

export type ContentInput = {
  caption: string;
  media: MediaRef[];
};

export type ContentIssueCode =
  | "nothing_to_post"
  | "text_only_unsupported"
  | "caption_too_long"
  | "too_many_hashtags"
  | "images_unsupported"
  | "videos_unsupported"
  | "too_many_media"
  | "too_many_videos"
  | "mixed_media"
  | "invalid_media_url";

export type ContentIssue = {
  platform: Platform;
  code: ContentIssueCode;
  message: string;
};

// Code points, not UTF-16 units: an emoji is one character to the platforms
// that count characters (Threads, X) and should be one here.
export function captionLength(caption: string): number {
  return Array.from(caption).length;
}

const HASHTAG = /(^|\s)#[\p{L}\p{N}_]+/gu;

export function hashtagCount(caption: string): number {
  return caption.match(HASHTAG)?.length ?? 0;
}

// Only absolute http(s) URLs: every platform fetches media server-side from
// a public address, and a relative path or data: URI can never work.
export function isValidMediaUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function validateContent(
  spec: PlatformContentSpec,
  input: ContentInput,
): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const issue = (code: ContentIssueCode, message: string) =>
    issues.push({ platform: spec.id, code, message });

  const caption = input.caption.trim();
  const media = input.media;
  const images = media.filter((m) => m.type === "image").length;
  const videos = media.filter((m) => m.type === "video").length;
  const name = spec.displayName;

  if (!caption && media.length === 0) {
    issue("nothing_to_post", "Add a caption or at least one media item.");
    // Nothing else is meaningful about an empty post.
    return issues;
  }

  if (media.length === 0 && !spec.capabilities.text) {
    issue(
      "text_only_unsupported",
      `${name} needs at least one image or video — it has no text-only posts.`,
    );
  }

  const length = captionLength(caption);
  if (length > spec.rules.captionMaxChars) {
    issue(
      "caption_too_long",
      `${name} allows ${spec.rules.captionMaxChars.toLocaleString()} characters; this caption is ${length.toLocaleString()}.`,
    );
  }

  if (spec.rules.hashtagMax !== null) {
    const tags = hashtagCount(caption);
    if (tags > spec.rules.hashtagMax) {
      issue(
        "too_many_hashtags",
        `${name} allows ${spec.rules.hashtagMax} hashtags; this caption has ${tags}.`,
      );
    }
  }

  for (const item of media) {
    if (!isValidMediaUrl(item.url)) {
      issue(
        "invalid_media_url",
        `Media must be a public https URL — "${item.url.slice(0, 60)}" is not.`,
      );
      break;
    }
  }

  if (images > 0 && !spec.capabilities.image) {
    issue("images_unsupported", `${name} does not accept images.`);
  }
  if (videos > 0 && !spec.capabilities.video) {
    issue("videos_unsupported", `${name} does not accept video.`);
  }

  if (media.length > 1 && !spec.capabilities.carousel) {
    issue(
      "too_many_media",
      `${name} takes one media item per post; this post has ${media.length}.`,
    );
  } else if (media.length > spec.rules.mediaMax) {
    issue(
      "too_many_media",
      `${name} allows up to ${spec.rules.mediaMax} media items; this post has ${media.length}.`,
    );
  }

  if (spec.rules.maxVideos !== null && videos > spec.rules.maxVideos) {
    issue(
      "too_many_videos",
      `${name} allows ${spec.rules.maxVideos} video per post; this post has ${videos}.`,
    );
  }

  if (images > 0 && videos > 0 && !spec.rules.mixedMediaAllowed) {
    issue(
      "mixed_media",
      `${name} cannot mix images and video in one post.`,
    );
  }

  return issues;
}

// Validate one post against every platform it targets, applying any per-
// platform caption override first. Returns issues grouped by platform id.
export function validateForTargets(
  specs: PlatformContentSpec[],
  input: ContentInput,
  overrides: Partial<Record<Platform, { caption?: string }>> = {},
): ContentIssue[] {
  return specs.flatMap((spec) =>
    validateContent(spec, {
      caption: overrides[spec.id]?.caption ?? input.caption,
      media: input.media,
    }),
  );
}
