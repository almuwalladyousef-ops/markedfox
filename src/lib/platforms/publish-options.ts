import type { IconName } from "@/components/icons";

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

/** Shared by every field kind: `help` is a hover title unless `showHelp` is
 *  set, in which case it prints under the label. Printing all of it turned a
 *  settings pane into an essay; hiding all of it would bury the two or three
 *  that carry a real consequence. */
type FieldBase = {
  key: string;
  label: string;
  /** Name from src/components/icons.tsx. A settings pane is a list of
   *  same-shaped rows, and the glyph is what makes one findable by scanning
   *  rather than by reading every label.
   *
   *  Typed as IconName rather than string: it was a string for one commit and
   *  a name that did not exist compiled fine, then crashed the settings step
   *  at render. */
  icon?: IconName;
  help?: string;
  /** Print the help rather than hiding it behind hover. For consequences the
   *  label cannot imply: what the platform overrides, what the law requires. */
  showHelp?: boolean;
};

export type PublishOptionField =
  | (FieldBase & {
      kind: "select";
      choices: { value: string; label: string }[];
      default: string;
    })
  | (FieldBase & {
      kind: "toggle";
      default: boolean;
    })
  | (FieldBase & {
      kind: "text";
      maxLength: number;
      placeholder?: string;
      /** Renders as a textarea rather than a single line. */
      multiline?: boolean;
    });

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
        icon: "eye",
        label: "Visibility",
        choices: [
          { value: "public", label: "Public" },
          { value: "unlisted", label: "Unlisted" },
          { value: "private", label: "Private" },
        ],
        default: "public",
        showHelp: true,
        help: "Until the API audit passes, YouTube forces every upload from an unverified project to private regardless of this setting.",
      },
      {
        kind: "text",
        key: "title",
        icon: "scripts",
        label: "Title",
        maxLength: 100,
        placeholder: "Taken from the first line of the caption",
        help: "YouTube titles cannot contain < or >.",
      },
      {
        kind: "text",
        key: "description",
        icon: "doc",
        label: "Description",
        maxLength: 5000,
        multiline: true,
        placeholder: "Taken from the caption",
      },
      {
        kind: "text",
        key: "tags",
        icon: "hooks",
        label: "Tags",
        maxLength: 400,
        placeholder: "comma, separated, tags",
      },
      {
        kind: "toggle",
        key: "add_shorts_tag",
        icon: "spark",
        label: "Add #shorts to the title",
        default: false,
        help: "Only useful for vertical videos under three minutes.",
      },
      {
        kind: "select",
        key: "made_for_kids",
        icon: "people",
        label: "Audience",
        choices: [
          { value: "no", label: "Not made for kids" },
          { value: "yes", label: "Made for kids" },
        ],
        default: "no",
        showHelp: true,
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
        icon: "chat",
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
        icon: "chat",
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
        key: "comment_enabled",
        icon: "chat",
        label: "Allow comments",
        default: true,
        showHelp: true,
        help: "Applied to the reel once it is live — Instagram only accepts this after publishing, not on the upload itself.",
      },
      {
        kind: "select",
        key: "profile_display",
        icon: "grid",
        label: "Profile display",
        choices: [
          { value: "grid", label: "Main grid and Reels tab" },
          { value: "reels_only", label: "Reels tab only" },
        ],
        default: "grid",
      },
      {
        kind: "text",
        key: "audio_name",
        icon: "templates",
        label: "Rename audio",
        maxLength: 60,
        placeholder: "Original audio",
        help: "What the audio is called when somebody taps it.",
      },
      {
        kind: "toggle",
        key: "is_trial",
        icon: "spark",
        label: "Trial",
        default: false,
        showHelp: true,
        help: "Shown to non-followers first and kept off your profile. Instagram decides whether a trial is actually applied — it is newer than the publishing API, so this is sent with the reel and may simply be ignored until Instagram accepts it. Everything else about the post publishes either way.",
      },
    ],
  },

  facebook: {
    title: "Share on Facebook",
    note: "These settings are only for Facebook.",
    videoOnly: true,
    fields: [
      {
        kind: "text",
        key: "title",
        icon: "scripts",
        label: "Title",
        maxLength: 255,
        placeholder: "Taken from the caption",
        help: "Shown above the video on the Page, separately from the caption.",
      },
      {
        kind: "toggle",
        key: "embeddable",
        icon: "external",
        label: "Allow embedding",
        default: true,
        help: "Lets other sites embed this video in their own pages.",
      },
    ],
  },

  snapchat: {
    title: "Share on Snapchat",
    note: "These settings are only for Snapchat.",
    videoOnly: true,
    fields: [
      {
        kind: "toggle",
        key: "save_to_profile",
        icon: "grid",
        label: "Save to your profile",
        default: true,
        help: "Off means it goes to Spotlight without being kept on your public profile.",
      },
      {
        kind: "select",
        key: "locale",
        icon: "link",
        label: "Language",
        choices: [
          { value: "en_US", label: "English (US)" },
          { value: "en_GB", label: "English (UK)" },
          { value: "es_ES", label: "Spanish" },
          { value: "fr_FR", label: "French" },
          { value: "de_DE", label: "German" },
          { value: "pt_BR", label: "Portuguese (Brazil)" },
          { value: "ar_AE", label: "Arabic" },
        ],
        default: "en_US",
        help: "Which audience Snapchat shows the Spotlight to.",
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
