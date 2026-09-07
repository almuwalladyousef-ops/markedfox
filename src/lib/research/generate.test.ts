import { describe, expect, it } from "vitest";

import {
  assertFinished,
  buildPrompt,
  configuredModel,
  GenerationError,
  MAX_TRANSCRIPT_CHARS,
} from "./generate";

describe("buildPrompt", () => {
  it("refuses a request with neither a topic nor a video", () => {
    expect(() => buildPrompt({ kind: "hooks" })).toThrow(GenerationError);
  });

  it("accepts a topic alone", () => {
    const prompt = buildPrompt({ kind: "script", topic: "home espresso" });
    expect(prompt).toContain("home espresso");
    expect(prompt).toContain("45-75 seconds");
  });

  it("tells the model WHY the reference video is worth learning from", () => {
    const prompt = buildPrompt({
      kind: "hooks",
      source: {
        title: "I quit my job",
        platform: "youtube",
        outlierScore: 6.2,
      },
    });
    // The multiple, not the raw view count, is the signal.
    expect(prompt).toContain("6.2x this channel's own recent median");
  });

  it("tells the model not to copy the reference wording", () => {
    const prompt = buildPrompt({
      kind: "script",
      source: { title: "A video", platform: "youtube" },
    });
    expect(prompt).toContain("do not copy its wording");
  });

  it("truncates a long transcript rather than sending the whole thing", () => {
    const prompt = buildPrompt({
      kind: "outline",
      source: {
        title: "Long one",
        platform: "youtube",
        transcript: "x".repeat(MAX_TRANSCRIPT_CHARS * 3),
      },
    });
    expect(prompt.length).toBeLessThan(MAX_TRANSCRIPT_CHARS * 2);
  });

  it("asks for ten numbered hooks", () => {
    const prompt = buildPrompt({ kind: "hooks", topic: "anything" });
    expect(prompt).toContain("10 alternative opening hooks");
    expect(prompt).toContain("Number them 1-10");
  });
});

describe("configuredModel", () => {
  it("is null with no key, so the UI can say 'coming soon' instead of failing", () => {
    expect(configuredModel({})).toBeNull();
  });

  it("prefers Gemini when both keys are present", () => {
    const model = configuredModel({
      GEMINI_API_KEY: "a",
      GROQ_API_KEY: "b",
    });
    expect(model?.provider).toBe("gemini");
  });

  it("falls back to Groq", () => {
    const model = configuredModel({ GROQ_API_KEY: "b" });
    expect(model?.provider).toBe("groq");
  });

  // Pinned so retiring a default is a deliberate edit rather than a silent
  // 404 on somebody's first generation, which is how gemini-2.5-flash went
  // stale here.
  it("defaults to a pinned Gemini model, never a floating alias", () => {
    const model = configuredModel({ GEMINI_API_KEY: "a" });
    expect(model?.model).toBe("gemini-3.6-flash");
    expect(model?.model).not.toMatch(/latest/);
  });

  it("honours an explicit model override", () => {
    const model = configuredModel({
      GEMINI_API_KEY: "a",
      GEMINI_MODEL: "gemini-3-pro",
    });
    expect(model?.model).toBe("gemini-3-pro");
  });
});

// Regression: the app shipped maxOutputTokens 2048 against a model that spends
// ~1,400 of them thinking, so the breakdown came back MAX_TOKENS with its JSON
// cut mid-object. Truncation now fails loudly rather than reaching a parser —
// or, worse, being saved as a finished script.
describe("assertFinished", () => {
  it("accepts a clean stop", () => {
    expect(() => assertFinished("STOP")).not.toThrow();
    expect(() => assertFinished(undefined)).not.toThrow();
  });

  it("names truncation rather than letting half an answer through", () => {
    expect(() => assertFinished("MAX_TOKENS")).toThrow(/ran out of room/);
  });

  it("says nothing was generated when the model refuses", () => {
    expect(() => assertFinished("SAFETY")).toThrow(/refused/);
  });

  it("still fails on a reason it has never seen", () => {
    expect(() => assertFinished("RECITATION")).toThrow(/stopped early/);
  });
});
