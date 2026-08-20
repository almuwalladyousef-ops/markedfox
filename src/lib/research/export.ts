import type { Breakdown } from "./breakdown";

// "Copy for an LLM": the whole analysis as one block of Markdown.
//
// Worth having as a first-class action rather than leaving people to select the
// page. Somebody who wants to finish the job in Claude or ChatGPT should be able
// to, and pretending otherwise just means they copy it badly.

export function exportAnalysis(input: {
  title: string;
  url: string;
  channel: string;
  platform: string;
  score: number | null;
  baselineViews: number | null;
  views: number | null;
  breakdown: Breakdown | null;
  transcript: string | null;
}): string {
  const lines: string[] = [`# ${input.title}`, ""];

  lines.push(`- Channel: ${input.channel} (${input.platform})`);
  lines.push(`- URL: ${input.url}`);
  if (input.views !== null) {
    lines.push(`- Views: ${input.views.toLocaleString()}`);
  }
  if (input.score !== null) {
    lines.push(
      `- Performance: ${input.score.toFixed(1)}x this channel's own recent median` +
        (input.baselineViews !== null
          ? ` (normally ${input.baselineViews.toLocaleString()})`
          : ""),
    );
  }

  const b = input.breakdown;
  if (b) {
    if (b.summary) lines.push("", "## Summary", "", b.summary);

    const idea: [string, string | null][] = [
      ["Topic", b.topic],
      ["Idea seed", b.ideaSeed],
      ["Unique angle", b.uniqueAngle],
      ["Common belief", b.commonBelief],
      ["Contrarian reality", b.contrarianReality],
    ];
    if (idea.some(([, value]) => value)) {
      lines.push("", "## The idea", "");
      for (const [label, value] of idea) {
        if (value) lines.push(`- **${label}:** ${value}`);
      }
    }

    const hook: [string, string | null][] = [
      ["Pattern", b.hookType?.replace(/_/g, " ") ?? null],
      ["Formula", b.hookFormula],
      ["Spoken hook", b.hook],
      ["Text hook", b.textHook],
      ["Alignment", b.hookAlignment],
      ["Curiosity loop", b.curiosityLoop],
    ];
    if (hook.some(([, value]) => value)) {
      lines.push("", "## The hook", "");
      for (const [label, value] of hook) {
        if (value) lines.push(`- **${label}:** ${value}`);
      }
    }

    if (b.structure.length > 0) {
      lines.push("", "## Structure", "");
      for (const beat of b.structure) {
        lines.push(`1. **${beat.label}** — ${beat.detail}`);
      }
    }

    const exec: [string, string | null][] = [
      ["Format", b.formatCategory],
      ["Delivery", b.formatNotes],
      ["Why that format", b.formatAnalysis],
      ["Visual treatment", b.visualLayout],
      ["Takeaway", b.takeaway],
    ];
    if (exec.some(([, value]) => value)) {
      lines.push("", "## Execution", "");
      for (const [label, value] of exec) {
        if (value) lines.push(`- **${label}:** ${value}`);
      }
    }
  }

  if (input.transcript) {
    lines.push("", "## Transcript", "", input.transcript);
  }

  return lines.join("\n");
}
