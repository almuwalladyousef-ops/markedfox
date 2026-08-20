// Step 3: deconstructing why a video worked.
//
// This is the step the whole pillar exists for. Finding an outlier tells you
// THAT something worked; writing a script from a title tells the model to guess.
// The breakdown is what turns "make one like this" into "this opened on a
// contradiction, held a loop it did not close until two thirds through, and
// paid it off in the last four seconds — now do that, about my topic."
//
// Everything here is pure: the prompt, the schema, the parsing, the repair of
// a model that answered in prose instead of JSON. The network call is
// generate.ts's job, and the credit accounting is the action's.

/** Hook patterns worth naming. Named rather than free text so the same pattern
 *  is recognisable across a whole feed — "what works in this niche" is a
 *  question about frequency, and free text cannot be counted. */
export const HOOK_TYPES = [
  "contradiction",
  "open_loop",
  "stakes",
  "number",
  "question",
  "callout",
  "demonstration",
  "story_cold_open",
  "negative",
  "other",
] as const;

export type HookType = (typeof HOOK_TYPES)[number];

export const HOOK_TYPE_LABELS: Record<HookType, string> = {
  contradiction: "Contradiction — says the opposite of what the viewer expects",
  open_loop: "Open loop — poses something it refuses to answer yet",
  stakes: "Stakes — names what is at risk",
  number: "Number — a specific, odd, or large figure",
  question: "Direct question — asks the viewer something",
  callout: "Callout — names exactly who this is for",
  demonstration: "Demonstration — shows the result before explaining it",
  story_cold_open: "Cold open — drops into the middle of a story",
  negative: "Negative — warns, or says what not to do",
  other: "Other",
};

export interface StructureBeat {
  /** What this beat is doing: "hook", "setup", "turn", "payoff", "CTA". */
  label: string;
  /** What actually happens in it. */
  detail: string;
}

export interface Breakdown {
  hook: string | null;
  hookType: HookType | null;
  curiosityLoop: string | null;
  structure: StructureBeat[];
  formatNotes: string | null;
  takeaway: string | null;
  notes: string | null;
}

export const EMPTY_BREAKDOWN: Breakdown = {
  hook: null,
  hookType: null,
  curiosityLoop: null,
  structure: [],
  formatNotes: null,
  takeaway: null,
  notes: null,
};

const MAX_TEXT = 2000;
const MAX_BEATS = 12;

function str(value: unknown, max = MAX_TEXT): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function hookType(value: unknown): HookType | null {
  if (typeof value !== "string") return null;
  const normalised = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return (HOOK_TYPES as readonly string[]).includes(normalised)
    ? (normalised as HookType)
    : null;
}

function beats(value: unknown): StructureBeat[] {
  if (!Array.isArray(value)) return [];
  const out: StructureBeat[] = [];
  for (const item of value.slice(0, MAX_BEATS)) {
    if (typeof item === "string") {
      // A model that answered with a flat list of strings is still useful;
      // rejecting it would throw away a correct answer over its shape.
      const detail = str(item, 400);
      if (detail) out.push({ label: "beat", detail });
      continue;
    }
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    const detail = str(record.detail ?? record.description ?? record.text, 400);
    if (!detail) continue;
    out.push({
      label: str(record.label ?? record.name ?? record.beat, 40) ?? "beat",
      detail,
    });
  }
  return out;
}

/**
 * Parse a model's answer into a breakdown.
 *
 * Tolerant on purpose. A model that wraps JSON in a fenced block, prefixes it
 * with "Here's the breakdown:", or returns beats as plain strings has still
 * done the work — discarding that over formatting would spend the user's
 * credit and show them nothing.
 */
export function parseBreakdown(raw: string): Breakdown | null {
  const json = extractJson(raw);
  if (!json) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const o = parsed as Record<string, unknown>;

  const breakdown: Breakdown = {
    hook: str(o.hook),
    hookType: hookType(o.hook_type ?? o.hookType),
    curiosityLoop: str(o.curiosity_loop ?? o.curiosityLoop),
    structure: beats(o.structure ?? o.beats),
    formatNotes: str(o.format_notes ?? o.formatNotes ?? o.format),
    takeaway: str(o.takeaway),
    notes: str(o.notes),
  };

  // An object with nothing usable in it is a failure, not an empty breakdown —
  // showing empty fields would look like the video had no structure.
  const hasContent =
    breakdown.hook ||
    breakdown.curiosityLoop ||
    breakdown.structure.length > 0 ||
    breakdown.takeaway;
  return hasContent ? breakdown : null;
}

/** Pull the JSON object out of an answer that may be fenced or prefaced. */
export function extractJson(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : text;

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return candidate.slice(start, end + 1);
}

/** One-line summary for a feed row or a card. */
export function summariseBreakdown(breakdown: Breakdown): string {
  if (breakdown.takeaway) return breakdown.takeaway;
  if (breakdown.hookType) return HOOK_TYPE_LABELS[breakdown.hookType];
  if (breakdown.hook) return `Opens: "${breakdown.hook.slice(0, 80)}"`;
  return "Breakdown available";
}
