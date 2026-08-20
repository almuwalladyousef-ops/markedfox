import { describe, expect, it } from "vitest";

import {
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

  it("honours an explicit model override", () => {
    const model = configuredModel({
      GEMINI_API_KEY: "a",
      GEMINI_MODEL: "gemini-3-pro",
    });
    expect(model?.model).toBe("gemini-3-pro");
  });
});
