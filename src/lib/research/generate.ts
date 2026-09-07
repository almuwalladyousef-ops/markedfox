// Turning a winning video into hooks, an outline, or a script.
//
// One AI call = one research credit, checked against the plan BEFORE the call
// so a denial costs nothing upstream. The provider is Gemini or Groq depending
// on which key is present, behind one small interface — swapping models is a
// key change, not a code change, and the model name is stored on every
// generation so old output stays explicable.
//
// Prompt construction is pure and exported, so what we ask the model is
// testable without spending a credit.

import { requireEnv } from "@/lib/env";

import type { Breakdown } from "./breakdown";
import { renderBreakdownForPrompt } from "./breakdown-prompt";

export type ScriptKind = "hooks" | "outline" | "script";

export interface GenerationSource {
  title: string;
  platform: string;
  url?: string | null;
  description?: string | null;
  transcript?: string | null;
  /** How far it beat its channel's baseline — the reason it is worth copying. */
  outlierScore?: number | null;
  /** The step-3 deconstruction. When present it REPLACES the transcript in the
   *  prompt: the mechanism is what should carry over, and passing the original
   *  words as well is how a "remix" turns into a rewrite. */
  breakdown?: Breakdown | null;
}

export interface GenerationRequest {
  kind: ScriptKind;
  /** Free-text angle from the user: "make it about budget travel". */
  topic?: string | null;
  source?: GenerationSource | null;
  /** The creator's niche, audience, voice and no-go list, already rendered by
   *  `personaLine`. Last in the prompt because it constrains everything above
   *  it. */
  persona?: string | null;
}

export class GenerationError extends Error {
  constructor(
    message: string,
    readonly code: "not_configured" | "upstream" | "empty" | "invalid_request",
  ) {
    super(message);
    this.name = "GenerationError";
  }
}

/** Transcripts run long; a model that gets 60k characters costs more and
 *  answers no better. The opening is where the hook lives, so the head is what
 *  gets kept. */
export const MAX_TRANSCRIPT_CHARS = 6000;

const INSTRUCTIONS: Record<ScriptKind, string> = {
  hooks:
    "Write 10 alternative opening hooks for a short-form video on this topic. " +
    "Each hook is one sentence, spoken aloud in under 4 seconds, and must work " +
    "as the first thing a viewer hears with no setup. Vary the angle: curiosity, " +
    "contradiction, stakes, a number, a direct question. Number them 1-10. No preamble.",
  outline:
    "Write a beat-by-beat outline for a short-form video on this topic. " +
    "Give the hook, 3-5 body beats each with the single point it makes, and the " +
    "close. One line per beat. No preamble.",
  script:
    "Write a complete short-form video script on this topic, 45-75 seconds when " +
    "read aloud. Open with a hook in the first 3 seconds, keep sentences short " +
    "and spoken, and end with one clear call to action. Plain text, no camera " +
    "directions, no preamble.",
};

/**
 * Build the prompt. Deliberately says what made the reference video work
 * (its multiple over its own channel) rather than pasting raw view counts,
 * because that multiple is the actual signal.
 */
export function buildPrompt(request: GenerationRequest): string {
  const parts: string[] = [
    "You write short-form video content for a creator.",
    INSTRUCTIONS[request.kind],
  ];

  if (request.source) {
    const s = request.source;

    if (s.breakdown) {
      // The good path. The model gets the MECHANISM and never sees the original
      // wording, so the result is a remix by construction rather than by
      // instruction — there is nothing there to copy.
      parts.push("", renderBreakdownForPrompt(s.breakdown));
    } else {
      // No breakdown yet: fall back to the raw video. Weaker, and the UI says
      // so, because a model handed a transcript will echo its phrasing.
      parts.push(
        "\nUse this high-performing video as the reference for structure and angle — " +
          "do not copy its wording.",
        `Platform: ${s.platform}`,
        `Title: ${s.title}`,
      );
      if (typeof s.outlierScore === "number") {
        parts.push(
          `Performance: ${s.outlierScore.toFixed(1)}x this channel's own recent median, ` +
            "so its structure is what is worth learning from.",
        );
      }
      if (s.description?.trim()) {
        parts.push(`Description: ${s.description.trim().slice(0, 1000)}`);
      }
      if (s.transcript?.trim()) {
        parts.push(
          `Transcript (may be truncated):\n${s.transcript.trim().slice(0, MAX_TRANSCRIPT_CHARS)}`,
        );
      }
    }
  }

  if (request.topic?.trim()) {
    parts.push(`\nThe creator's own topic and angle: ${request.topic.trim()}`);
  }

  if (request.persona?.trim()) {
    parts.push(`\n${request.persona.trim()}`);
  }

  if (!request.source && !request.topic?.trim()) {
    throw new GenerationError(
      "Give a topic or pick a video to work from",
      "invalid_request",
    );
  }

  return parts.join("\n");
}

export interface Generation {
  output: string;
  model: string;
}

/** Which model this deployment will use, or null when no key is configured.
 *  Exported so the UI can say what is missing instead of offering a button
 *  that fails silently. */
export function configuredModel(
  env: Record<string, string | undefined> = process.env,
): { provider: "gemini" | "groq"; model: string } | null {
  // Pinned, never a floating alias like gemini-flash-latest: the model name
  // is stored on every generation so old output stays explicable, and an
  // alias that moves underneath us makes that record a lie.
  //
  // gemini-2.5-flash was the default until 2026-09-07 and now answers a new
  // key with 404 "no longer available to new users" — a retired default is
  // invisible until somebody's first generation fails, so check this on any
  // fresh key before assuming the code is at fault.
  if (env.GEMINI_API_KEY) {
    return {
      provider: "gemini",
      model: env.GEMINI_MODEL || "gemini-3.6-flash",
    };
  }
  if (env.GROQ_API_KEY) {
    return {
      provider: "groq",
      model: env.GROQ_MODEL || "llama-3.3-70b-versatile",
    };
  }
  return null;
}

const TIMEOUT_MS = 60_000;

export async function generate(
  request: GenerationRequest,
): Promise<Generation> {
  return generateFromPrompt(buildPrompt(request));
}

/** The same call with a prompt built elsewhere — the breakdown, the standalone
 *  hook generator, and the channel audit all have their own prompts and share
 *  this plumbing. */
export async function generateFromPrompt(prompt: string): Promise<Generation> {
  const configured = configuredModel();
  if (!configured) {
    throw new GenerationError(
      "AI generation needs GEMINI_API_KEY or GROQ_API_KEY",
      "not_configured",
    );
  }

  const output =
    configured.provider === "gemini"
      ? await callGemini(configured.model, prompt)
      : await callGroq(configured.model, prompt);

  const trimmed = output.trim();
  if (!trimmed) {
    throw new GenerationError("The model returned nothing", "empty");
  }
  return { output: trimmed, model: configured.model };
}

/**
 * The Gemini output ceiling, and it is NOT just "room for the answer".
 *
 * Gemini 3 models think before they answer, and those thinking tokens are
 * spent against this same budget. Measured on the breakdown prompt: ~1,400
 * thinking tokens for ~630 tokens of actual JSON. At the 2,048 this used to
 * carry, the breakdown came back `MAX_TOKENS` with the JSON cut mid-object —
 * so step 3, the whole point of the research pillar, failed on every video.
 *
 * 8,192 is not a cost decision: billing is per token GENERATED, so a ceiling
 * nobody reaches costs nothing. It is only the point at which a normal answer
 * stops being truncated.
 */
const GEMINI_MAX_OUTPUT_TOKENS = 8192;

async function callGemini(model: string, prompt: string): Promise<string> {
  const key = requireEnv("GEMINI_API_KEY");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const response = await post(url, {
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
      },
    },
  });

  const data = response as {
    candidates?: {
      finishReason?: string;
      content?: { parts?: { text?: string }[] };
    }[];
  };
  const candidate = data.candidates?.[0];

  // Refused rather than returned. A truncated JSON breakdown at least fails
  // loudly at the parser, but a truncated SCRIPT reads like a finished one and
  // would be saved as the draft — so the cut is caught here, where we can still
  // say what happened, and the caller releases the credit.
  assertFinished(candidate?.finishReason);

  return (candidate?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("");
}

/** Turn a provider's stop reason into a message a person can act on.
 *  Anything other than a clean stop is treated as a failure: half an answer is
 *  worse than none, because nothing downstream can tell it is half. */
export function assertFinished(reason: string | undefined | null): void {
  if (!reason) return;
  const clean = reason.toUpperCase();
  if (clean === "STOP" || clean === "END_TURN") return;
  if (clean === "MAX_TOKENS" || clean === "LENGTH") {
    throw new GenerationError(
      "The model ran out of room before it finished. Try a shorter transcript or a narrower topic.",
      "upstream",
    );
  }
  if (clean === "SAFETY" || clean === "PROHIBITED_CONTENT" || clean === "BLOCKLIST") {
    throw new GenerationError(
      "The model refused this one on safety grounds. Nothing was generated.",
      "upstream",
    );
  }
  throw new GenerationError(
    `The model stopped early (${reason}).`,
    "upstream",
  );
}

async function callGroq(model: string, prompt: string): Promise<string> {
  const key = requireEnv("GROQ_API_KEY");
  const response = await post("https://api.groq.com/openai/v1/chat/completions", {
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: {
      model,
      temperature: 0.9,
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    },
  });

  const data = response as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content ?? "";
}

async function post(
  url: string,
  init: { headers: Record<string, string>; body: unknown },
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: init.headers,
      body: JSON.stringify(init.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new GenerationError(
      `The model did not answer: ${(error as Error).message}`,
      "upstream",
    );
  }

  const text = await response.text();
  if (!response.ok) {
    throw new GenerationError(
      `The model returned ${response.status}: ${text.slice(0, 200)}`,
      "upstream",
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new GenerationError("The model returned malformed JSON", "upstream");
  }
}
