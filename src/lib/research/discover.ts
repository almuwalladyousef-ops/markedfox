import { RESEARCH_PLATFORMS, type ResearchPlatform, type SourceIdentity } from "./types";

// Turning "who should I study?" into real channels.
//
// The honest constraint this is built around: a language model asked to name
// channels in a niche will invent some of them. Confidently. So nothing a model
// says is ever shown to the user directly — it proposes NAMES, each name is
// looked up against the platform's own API, and only the ones that resolve to a
// real channel with a real follower count are offered.
//
// The lookup has to be an EXACT one (provider.resolveExact). A fuzzy search
// returns a nearest match for essentially any string, so checking an invented
// handle against one does not check anything — it launders the hallucination
// into a real, unrelated channel and puts it on the user's watchlist looking
// verified.

/** A channel offered to the user, plus where the suggestion came from. */
export interface ChannelCandidate extends SourceIdentity {
  /** True when it is already on this workspace's watchlist. */
  watching: boolean;
  /** The group heading it sits under, e.g. "SOCIAL MEDIA MARKETING". */
  group: string;
}

/** Follower buckets, named. A size filter phrased as "50k – 250k" makes the
 *  user do arithmetic; "Small" does not, so both are shown. */
export const SIZE_TIERS = [
  { id: "nano", label: "Nano", range: "< 10K followers", min: 0, max: 10_000 },
  { id: "micro", label: "Micro", range: "10K – 50K followers", min: 10_000, max: 50_000 },
  { id: "small", label: "Small", range: "50K – 250K followers", min: 50_000, max: 250_000 },
  { id: "medium", label: "Medium", range: "250K – 1M followers", min: 250_000, max: 1_000_000 },
  { id: "large", label: "Large", range: "1M – 5M followers", min: 1_000_000, max: 5_000_000 },
  { id: "mega", label: "Mega", range: "> 5M followers", min: 5_000_000, max: Number.MAX_SAFE_INTEGER },
] as const;

export type SizeTierId = (typeof SIZE_TIERS)[number]["id"];

export function matchesSizeTiers(
  followers: number | null,
  tiers: SizeTierId[],
): boolean {
  if (tiers.length === 0) return true;
  // A channel whose follower count we could not read is kept rather than
  // dropped: hiding a real channel because a number was missing is the worse
  // of the two mistakes.
  if (followers === null) return true;
  return tiers.some((id) => {
    const tier = SIZE_TIERS.find((t) => t.id === id);
    return tier ? followers >= tier.min && followers < tier.max : false;
  });
}

/**
 * Ask for channel names, in groups.
 *
 * The prompt asks for handles rather than descriptions because a handle is
 * checkable and a description is not. Grouping is requested because a flat list
 * of thirty accounts is harder to choose from than three themed groups of ten.
 */
export function buildChannelSuggestionPrompt(input: {
  description: string;
  platform: string;
  alreadyWatching: string[];
  count?: number;
}): string {
  const count = Math.min(Math.max(input.count ?? 24, 6), 40);
  const lines = [
    "You know the short-form creator landscape.",
    "",
    `Name up to ${count} ${input.platform} accounts whose content matches the description below.`,
    "",
    "Rules:",
    "- Only accounts you are reasonably confident exist. A wrong handle wastes a lookup and is silently dropped, so guessing gains you nothing.",
    "- Handles only — no display names, no descriptions, no URLs.",
    "- Group them under 2 to 4 short THEME headings that describe what that group makes.",
    "- Prefer accounts that post regularly and recently over famous but dormant ones.",
    "",
    "Format, exactly:",
    "## THEME NAME",
    "@handle",
    "@handle",
    "",
    `Description: ${input.description.trim().slice(0, 400)}`,
  ];

  if (input.alreadyWatching.length > 0) {
    lines.push(
      "",
      "Already tracked, so do not repeat these — suggest accounts like them instead:",
      input.alreadyWatching.slice(0, 40).join(", "),
    );
  }

  return lines.join("\n");
}

/** Parse the grouped handle list back out. Tolerant: a model that skipped the
 *  headings still produced usable handles, and throwing them away over
 *  formatting would spend a credit for nothing. */
export function parseChannelSuggestions(
  raw: string,
): { group: string; handles: string[] }[] {
  const groups: { group: string; handles: string[] }[] = [];
  let current: { group: string; handles: string[] } | null = null;

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const heading = trimmed.match(/^#{1,3}\s*(.+)$/);
    if (heading) {
      current = { group: heading[1].trim().slice(0, 60), handles: [] };
      groups.push(current);
      continue;
    }

    const handle = trimmed
      .replace(/^[-*\d.)\s]+/, "")
      .trim()
      .match(/^@?([A-Za-z0-9._-]{2,40})$/);
    if (!handle) continue;

    if (!current) {
      current = { group: "Suggested", handles: [] };
      groups.push(current);
    }
    if (current.handles.length < 20) current.handles.push(handle[1]);
  }

  return groups.filter((group) => group.handles.length > 0);
}

/** Pull channel URLs and handles out of a pasted blob, deduplicated. */
export function parsePastedChannels(raw: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(/[\n,]+/)) {
    const value = part.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value.slice(0, 300));
    if (out.length >= 50) break;
  }
  return out;
}

export type PickedChannel = {
  platform: ResearchPlatform;
  externalId: string;
  handle: string | null;
  title: string;
  thumbnailUrl: string | null;
  followerCount: number | null;
};

/** One ticked candidate, as JSON from the picker. Anything malformed is
 *  dropped rather than half-read. */
export function parsePickedChannel(raw: string): PickedChannel | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const o = parsed as Record<string, unknown>;

  const platform = String(o.platform ?? "");
  if (!(RESEARCH_PLATFORMS as readonly string[]).includes(platform)) return null;
  const externalId = typeof o.externalId === "string" ? o.externalId.trim() : "";
  if (!externalId) return null;

  const followers = Number(o.followerCount);
  return {
    platform: platform as ResearchPlatform,
    externalId: externalId.slice(0, 200),
    handle: typeof o.handle === "string" && o.handle ? o.handle.slice(0, 120) : null,
    title: typeof o.title === "string" ? o.title.slice(0, 200) : externalId,
    thumbnailUrl:
      typeof o.thumbnailUrl === "string" && /^https?:\/\//i.test(o.thumbnailUrl)
        ? o.thumbnailUrl.slice(0, 2048)
        : null,
    followerCount: Number.isFinite(followers) && followers >= 0 ? followers : null,
  };
}
