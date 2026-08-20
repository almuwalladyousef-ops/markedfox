// The prompts for step 3 and the generation that follows it.
//
// Kept separate from breakdown.ts and generate.ts because what we ASK is the
// part most worth reading, arguing with, and changing — and it should be
// readable without wading through fetch plumbing. Pure strings in, pure string
// out, so every prompt is testable without spending a credit.

import { HOOK_TYPES, type Breakdown } from "./breakdown";

export interface BreakdownSubject {
  title: string;
  platform: string;
  description?: string | null;
  transcript?: string | null;
  /** How far it beat its own channel — the reason it is on the table at all. */
  outlierScore?: number | null;
  durationSeconds?: number | null;
}

/** The transcript head is where the hook and the loop live. */
export const BREAKDOWN_TRANSCRIPT_CHARS = 8000;

/**
 * Ask for the deconstruction.
 *
 * Three deliberate instructions in here, each fixing a way this goes wrong:
 *
 *   - **Quote the hook, do not paraphrase it.** A paraphrased hook loses the
 *     exact wording, which is the part that worked.
 *   - **Say "unknown" rather than inventing.** With no transcript the model
 *     cannot know the pacing, and a confident guess about a video the user can
 *     go and watch destroys trust in every other field.
 *   - **JSON only.** Parsed into columns, so prose is unusable.
 */
export function buildBreakdownPrompt(subject: BreakdownSubject): string {
  const parts: string[] = [
    "You analyse short-form video and explain why individual videos outperform.",
    "",
    "Break down the video below. Your job is to name the MECHANISM — what made a",
    "viewer keep watching — not to summarise what the video was about.",
    "",
    "Rules:",
    "- Quote the hook VERBATIM from the transcript when there is one. Do not paraphrase it; the exact wording is the thing that worked.",
    "- If the transcript is missing or too short to tell, write \"unknown\" for that field rather than guessing. The user can watch this video, and an invented detail costs you every other field's credibility.",
    "- Be specific and concrete. \"Strong hook\" is worthless; \"opens by contradicting the advice the audience has already heard\" is usable.",
    "- Answer with JSON only, no prose before or after, no code fence.",
    "",
    "JSON shape:",
    "{",
    '  "hook": "the opening line, quoted",',
    `  "hook_type": one of ${HOOK_TYPES.join(" | ")},`,
    '  "curiosity_loop": "what question is opened and when it is answered",',
    '  "structure": [{"label": "hook|setup|turn|payoff|cta", "detail": "what happens in this beat"}],',
    '  "format_notes": "delivery, cut rhythm, text on screen, b-roll",',
    '  "takeaway": "the single most transferable thing to copy",',
    '  "notes": "anything else worth knowing"',
    "}",
    "",
    "The video:",
    `Platform: ${subject.platform}`,
    `Title: ${subject.title}`,
  ];

  if (typeof subject.durationSeconds === "number") {
    parts.push(`Length: ${subject.durationSeconds}s`);
  }
  if (typeof subject.outlierScore === "number") {
    parts.push(
      `Performance: ${subject.outlierScore.toFixed(1)}x this channel's own recent median — ` +
        "it beat the channel's normal, which is why it is worth deconstructing.",
    );
  }
  if (subject.description?.trim()) {
    parts.push(`Description: ${subject.description.trim().slice(0, 1500)}`);
  }
  if (subject.transcript?.trim()) {
    parts.push(
      "",
      "Transcript (may be truncated):",
      subject.transcript.trim().slice(0, BREAKDOWN_TRANSCRIPT_CHARS),
    );
  } else {
    parts.push(
      "",
      "No transcript is available. Work from the title and description, and write",
      '"unknown" wherever you genuinely cannot tell.',
    );
  }

  return parts.join("\n");
}

/**
 * Render a breakdown back into prose for a later prompt.
 *
 * This is what makes step 4 different from a plain prompt: the script generator
 * receives the MECHANISM, not the source video's words. Which also means the
 * output is a remix rather than a rewrite — the structure carries over, the
 * wording cannot, because the wording was never passed on.
 */
export function renderBreakdownForPrompt(breakdown: Breakdown): string {
  const lines: string[] = ["The framework this is built on, taken from a video that beat its channel's average:"];

  if (breakdown.hookType) lines.push(`- Hook pattern: ${breakdown.hookType.replace(/_/g, " ")}`);
  if (breakdown.curiosityLoop) lines.push(`- What holds attention: ${breakdown.curiosityLoop}`);
  if (breakdown.structure.length > 0) {
    lines.push("- Beat structure:");
    for (const beat of breakdown.structure) {
      lines.push(`    ${beat.label}: ${beat.detail}`);
    }
  }
  if (breakdown.formatNotes) lines.push(`- Format: ${breakdown.formatNotes}`);
  if (breakdown.takeaway) lines.push(`- The transferable part: ${breakdown.takeaway}`);

  lines.push(
    "",
    "Reuse the STRUCTURE and the hook pattern. Do not reuse the original wording,",
    "subject matter, or examples — this must read as an original piece.",
  );

  return lines.join("\n");
}

/** The standalone hook generator: many variations, one topic, no source video. */
export function buildHookPrompt(input: {
  topic: string;
  count?: number;
  breakdown?: Breakdown | null;
}): string {
  const count = Math.min(Math.max(input.count ?? 20, 5), 30);
  const parts = [
    "You write opening hooks for short-form video.",
    "",
    `Write ${count} hooks for the topic below. Each one:`,
    "- is a single sentence, spoken aloud in under four seconds",
    "- works as the very first thing a viewer hears, with no setup before it",
    "- makes a specific claim or opens a specific question — no throat-clearing",
    "",
    `Spread them across these patterns, and label each one with the pattern it uses: ${HOOK_TYPES.filter((h) => h !== "other").join(", ")}.`,
    "",
    "Format: one per line, numbered, with the pattern in brackets at the end.",
    "No preamble, no closing note.",
    "",
    `Topic: ${input.topic.trim()}`,
  ];

  if (input.breakdown) {
    parts.push("", renderBreakdownForPrompt(input.breakdown));
  }

  return parts.join("\n");
}

/**
 * The personal audit: a creator's own channel, judged against itself.
 *
 * Deliberately framed around their OWN outliers rather than anyone else's
 * benchmarks. What worked for this account is the only evidence that transfers
 * to this account.
 */
export function buildAuditPrompt(input: {
  channelTitle: string;
  platform: string;
  baselineViews: number | null;
  sample: number;
  top: { title: string; score: number | null; hookType?: string | null }[];
  bottom: { title: string; score: number | null }[];
}): string {
  const lines: string[] = [
    "You audit a creator's own short-form channel and tell them what to do more of.",
    "",
    "Use only the evidence below — this creator's own videos, scored against this",
    "channel's own median. Do not compare them to other creators or to platform",
    "averages: what worked on THIS account is the only evidence that transfers to it.",
    "",
    "Answer in four short sections, plain text, no preamble:",
    "1. What the winners have in common (be specific — patterns, not praise)",
    "2. What the underperformers have in common",
    "3. The three things to do more of, in priority order",
    "4. One thing to stop doing",
    "",
    `Channel: ${input.channelTitle} (${input.platform})`,
    input.baselineViews !== null
      ? `Typical performance: ${input.baselineViews.toLocaleString()} across ${input.sample} recent videos`
      : `Not enough videos yet for a reliable baseline (${input.sample} so far) — say so if it limits the audit.`,
    "",
    "Best performers:",
  ];

  for (const video of input.top) {
    lines.push(
      `- ${video.title}${video.score !== null ? ` (${video.score.toFixed(1)}x)` : ""}` +
        (video.hookType ? ` [hook: ${video.hookType.replace(/_/g, " ")}]` : ""),
    );
  }

  lines.push("", "Worst performers:");
  for (const video of input.bottom) {
    lines.push(`- ${video.title}${video.score !== null ? ` (${video.score.toFixed(1)}x)` : ""}`);
  }

  return lines.join("\n");
}
