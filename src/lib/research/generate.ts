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

export type ScriptKind = "hooks" | "outline" | "script";

export interface GenerationSource {
  title: string;
  platform: string;
  url?: string | null;
  description?: string | null;
  transcript?: string | null;
  /** How far it beat its channel's baseline — the reason it is worth copying. */
  outlierScore?: number | null;
}

export interface GenerationRequest {
  kind: ScriptKind;
  /** Free-text angle from the user: "make it about budget travel". */
  topic?: string | null;
  source?: GenerationSource | null;
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

  if (request.topic?.trim()) {
    parts.push(`\nThe creator's own topic and angle: ${request.topic.trim()}`);
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
 *  Exported so the UI can show "Coming soon" instead of a button that fails. */
export function configuredModel(
  env: Record<string, string | undefined> = process.env,
): { provider: "gemini" | "groq"; model: string } | null {
  if (env.GEMINI_API_KEY) {
    return {
      provider: "gemini",
      model: env.GEMINI_MODEL || "gemini-2.5-flash",
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
  const configured = configuredModel();
  if (!configured) {
    throw new GenerationError(
      "AI generation needs GEMINI_API_KEY or GROQ_API_KEY",
      "not_configured",
    );
  }

  const prompt = buildPrompt(request);
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

async function callGemini(model: string, prompt: string): Promise<string> {
  const key = requireEnv("GEMINI_API_KEY");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const response = await post(url, {
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.9, maxOutputTokens: 2048 },
    },
  });

  const data = response as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return (data.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("");
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
