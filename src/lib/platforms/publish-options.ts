import type { Platform, PlatformPublishOptions } from "./types";

// The per-platform settings a post carries, declared as data.
//
// Every platform has its own publishing knobs — YouTube wants a title and a
// visibility and a COPPA answer, X wants to know who may reply, Threads the
// same in different words. Modelling them as one shared "options" object would
// mean either the lowest common denominator or a shape nobody can validate.
//
// So each platform declares its own fields here, and both the composer and the
// API read the same declaration: the composer renders them, the adapter applies
// them, and `sanitizePublishOptions` is what stops anything else being stored.
// Adding a field is one entry in this file plus the line in the adapter that
// uses it — never a new column and never a change to the composer.
//
// Only settings the platform's API genuinely accepts appear here. A toggle that
// looks right and does nothing is worse than no toggle: the user believes they
// turned comments off.

export type PublishOptionField =
  | {
      kind: "select";
      key: string;
      label: string;
      help?: string;
      choices: { value: string; label: string }[];
      default: string;
    }
  | {
      kind: "toggle";
      key: string;
      label: string;
      help?: string;
      default: boolean;
    }
  | {
      kind: "text";
      key: string;
      label: string;
      help?: string;
      maxLength: number;
      placeholder?: string;
      /** Renders as a textarea rather than a single line. */
      multiline?: boolean;
    };

export interface PlatformOptionSpec {
  /** Shown as the section heading: "Share on YouTube". */
  title: string;
  /** One line under it, in the platform's own terms. */
  note?: string;
  fields: PublishOptionField[];
  /** Only offer these when the post carries a video. */
  videoOnly?: boolean;
}

export const PUBLISH_OPTIONS: Partial<Record<Platform, PlatformOptionSpec>> = {
  youtube: {
    title: "Share on YouTube",
    note: "These settings are only for YouTube.",
    fields: [
      {
        kind: "select",
        key: "privacy_status",
        label: "Visibility",
        choices: [
          { value: "public", label: "Public" },
          { value: "unlisted", label: "Unlisted" },
          { value: "private", label: "Private" },
        ],
        default: "public",
        help: "Until the API audit passes, YouTube forces every upload from an unverified project to private regardless of this setting.",
      },
      {
        kind: "text",
        key: "title",
        label: "Title",
        maxLength: 100,
        placeholder: "Taken from the first line of the caption",
        help: "YouTube titles cannot contain < or >.",
      },
      {
        kind: "text",
        key: "description",
        label: "Description",
        maxLength: 5000,
        multiline: true,
        placeholder: "Taken from the caption",
      },
      {
        kind: "text",
        key: "tags",
        label: "Tags",
        maxLength: 400,
        placeholder: "comma, separated, tags",
      },
      {
        kind: "toggle",
        key: "add_shorts_tag",
        label: "Add #shorts to the title",
        default: false,
        help: "Only useful for vertical videos under three minutes.",
      },
      {
        kind: "select",
        key: "made_for_kids",
        label: "Audience",
        choices: [
          { value: "no", label: "Not made for kids" },
          { value: "yes", label: "Made for kids" },
        ],
        default: "no",
        help: "You are legally required to answer this under COPPA, wherever you are. Getting it wrong is YouTube's problem to enforce and yours to answer for.",
      },
    ],
  },

  x: {
    title: "Share on X",
    note: "These settings are only for X.",
    fields: [
      {
        kind: "select",
        key: "reply_settings",
        label: "Who can reply",
        choices: [
          { value: "everyone", label: "Everyone" },
          { value: "following", label: "Accounts you follow" },
          { value: "mentionedUsers", label: "Only accounts you mention" },
        ],
        default: "everyone",
      },
    ],
  },

  threads: {
    title: "Share on Threads",
    note: "These settings are only for Threads.",
    fields: [
      {
        kind: "select",
        key: "reply_control",
        label: "Who can reply",
        choices: [
          { value: "everyone", label: "Anyone" },
          { value: "accounts_you_follow", label: "Profiles you follow" },
          { value: "mentioned_only", label: "Profiles you mention" },
        ],
        default: "everyone",
      },
    ],
  },

  instagram: {
    title: "Share on Instagram",
    note: "These settings are only for Instagram.",
    videoOnly: true,
    fields: [
      {
        kind: "toggle",
        key: "share_to_feed",
        label: "Also show this reel in your feed grid",
        default: true,
        help: "Off means it appears in the Reels tab only.",
      },
    ],
  },
};

/**
 * Keep only the fields this platform declares, coerced to the declared type.
 *
 * The gate between "the browser sent an options object" and "the adapter uses
 * it". A field that is absent, unknown, or the wrong type is dropped rather
 * than defaulted, so the adapter's own fallback decides — one place makes the
 * choice instead of two disagreeing.
 */
export function sanitizePublishOptions(
  platform: Platform,
  options: PlatformPublishOptions | undefined,
): PlatformPublishOptions {
  const spec = PUBLISH_OPTIONS[platform];
  if (!spec || !options) return {};

  const out: PlatformPublishOptions = {};
  for (const field of spec.fields) {
    const raw = options[field.key];
    if (raw === undefined || raw === null) continue;

    if (field.kind === "toggle") {
      if (typeof raw === "boolean") out[field.key] = raw;
      else if (raw === "true" || raw === "false") out[field.key] = raw === "true";
      continue;
    }
    if (field.kind === "select") {
      const value = String(raw);
      if (field.choices.some((choice) => choice.value === value)) {
        out[field.key] = value;
      }
      continue;
    }
    const text = String(raw).trim();
    if (text) out[field.key] = text.slice(0, field.maxLength);
  }
  return out;
}

/** The reasons these options cannot be used, in the user's words. */
export function validatePublishOptions(
  platform: Platform,
  options: PlatformPublishOptions | undefined,
): string[] {
  const spec = PUBLISH_OPTIONS[platform];
  if (!spec || !options) return [];

  const issues: string[] = [];
  for (const field of spec.fields) {
    const raw = options[field.key];
    if (raw === undefined || raw === null || raw === "") continue;

    if (field.kind === "select" && !field.choices.some((c) => c.value === String(raw))) {
      issues.push(`${field.label} is not one of the choices offered.`);
    }
    if (field.kind === "text" && String(raw).length > field.maxLength) {
      issues.push(
        `${field.label} is ${String(raw).length} characters; the limit is ${field.maxLength}.`,
      );
    }
  }

  // Two YouTube rules that only bite after the whole video file has been
  // uploaded, which is far too late to learn about them.
  if (platform === "youtube") {
    const title = options.title;
    if (typeof title === "string" && /[<>]/.test(title)) {
      issues.push("YouTube titles cannot contain < or >.");
    }
    const description = options.description;
    if (typeof description === "string") {
      // YouTube counts BYTES; the maxLength above counts UTF-16 units, so a
      // description of emoji can pass that and still be four times the limit.
      const bytes = new TextEncoder().encode(description).length;
      if (bytes > 5000) {
        issues.push(
          `That description is ${bytes} bytes and YouTube allows 5,000. Emoji and accented characters count as more than one.`,
        );
      }
    }
  }

  return issues;
}

/** Read one option with its declared default. */
export function optionValue(
  platform: Platform,
  options: PlatformPublishOptions | undefined,
  key: string,
): string | boolean | undefined {
  const spec = PUBLISH_OPTIONS[platform];
  const field = spec?.fields.find((f) => f.key === key);
  if (!field) return undefined;
  const raw = options?.[key];
  if (raw === undefined || raw === null || raw === "") {
    return field.kind === "text" ? undefined : field.default;
  }
  if (field.kind === "toggle") {
    return typeof raw === "boolean" ? raw : raw === "true";
  }
  return String(raw);
}
