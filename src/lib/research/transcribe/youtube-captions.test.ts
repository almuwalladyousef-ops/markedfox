import { describe, expect, it } from "vitest";

import { parseJson3, pickCaptionTrack } from "./youtube-captions";

const manualEn = { baseUrl: "https://en", languageCode: "en" };
const asrEn = { baseUrl: "https://en-asr", languageCode: "en", kind: "asr" };
const manualJa = { baseUrl: "https://ja", languageCode: "ja" };

describe("pickCaptionTrack", () => {
  it("returns null when the video has no captions at all", () => {
    expect(pickCaptionTrack([])).toBeNull();
  });

  it("prefers a human-written track over auto-captions", () => {
    // Auto-captions mis-hear proper nouns, and the breakdown quotes the hook
    // VERBATIM — so a mis-heard opening line becomes a confident wrong answer.
    expect(pickCaptionTrack([asrEn, manualEn])?.baseUrl).toBe("https://en");
  });

  it("prefers English over a hand-written other language", () => {
    // Every prompt downstream is written in English; a breakdown of a Japanese
    // transcript would be a breakdown of a translation.
    expect(pickCaptionTrack([manualJa, asrEn])?.baseUrl).toBe("https://en-asr");
  });

  it("matches regional English codes", () => {
    const enGb = { baseUrl: "https://en-GB", languageCode: "en-GB" };
    expect(pickCaptionTrack([manualJa, enGb])?.baseUrl).toBe("https://en-GB");
  });

  it("falls back to whatever exists rather than giving up", () => {
    // A transcript in the wrong language still beats the title alone, which is
    // the only other thing the breakdown would have.
    expect(pickCaptionTrack([manualJa])?.baseUrl).toBe("https://ja");
  });
});

describe("parseJson3", () => {
  it("joins segments across events into prose", () => {
    const body = JSON.stringify({
      events: [
        { segs: [{ utf8: "Never " }, { utf8: "gonna" }] },
        { segs: [{ utf8: " give you up" }] },
      ],
    });
    expect(parseJson3(body)).toBe("Never gonna give you up");
  });

  it("collapses the newlines and double spaces YouTube pads with", () => {
    const body = JSON.stringify({
      events: [{ segs: [{ utf8: "one\n\ntwo   three" }] }],
    });
    expect(parseJson3(body)).toBe("one two three");
  });

  it("returns empty for a body that is not json3", () => {
    // The dead endpoint this module replaces answered HTTP 200 with an empty
    // body. Returning "" here is what lets the caller call that a FAILURE
    // rather than storing "this video has no captions" forever.
    expect(parseJson3("")).toBe("");
    expect(parseJson3("<?xml version=\"1.0\"?><timedtext/>")).toBe("");
  });

  it("survives events with no segments", () => {
    const body = JSON.stringify({ events: [{}, { segs: [{ utf8: "hi" }] }] });
    expect(parseJson3(body)).toBe("hi");
  });
});
