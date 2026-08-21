import { describe, expect, it } from "vitest";

import {
  optionValue,
  sanitizePublishOptions,
  validatePublishOptions,
} from "./publish-options";

describe("sanitizePublishOptions", () => {
  it("keeps only the fields the platform declares", () => {
    const out = sanitizePublishOptions("x", {
      reply_settings: "following",
      // Not a field X declares. Storing it would mean shipping a setting the
      // adapter silently ignores.
      privacy_status: "private",
    });
    expect(out).toEqual({ reply_settings: "following" });
  });

  it("drops a choice that is not on the list", () => {
    expect(sanitizePublishOptions("x", { reply_settings: "nobody" })).toEqual({});
  });

  it("accepts a checkbox arriving as a string", () => {
    expect(
      sanitizePublishOptions("youtube", { add_shorts_tag: "true" }),
    ).toEqual({ add_shorts_tag: true });
  });

  it("trims text to the declared limit and drops it when empty", () => {
    const long = "a".repeat(200);
    expect(sanitizePublishOptions("youtube", { title: long }).title).toHaveLength(
      100,
    );
    expect(sanitizePublishOptions("youtube", { title: "   " })).toEqual({});
  });

  it("returns nothing for a platform with no settings", () => {
    expect(sanitizePublishOptions("facebook", { anything: "1" })).toEqual({});
  });
});

describe("validatePublishOptions", () => {
  it("says which choice was wrong", () => {
    expect(validatePublishOptions("youtube", { privacy_status: "secret" })).toEqual(
      ["Visibility is not one of the choices offered."],
    );
  });

  it("catches the YouTube title characters that fail after the upload", () => {
    expect(validatePublishOptions("youtube", { title: "5 < 6 tips" })).toEqual([
      "YouTube titles cannot contain < or >.",
    ]);
  });

  it("counts description bytes, not characters", () => {
    // 2,000 emoji is 8,000 bytes but only 4,000 UTF-16 units, so the declared
    // maxLength lets it through — and YouTube only refuses it after the whole
    // video has been uploaded.
    const emoji = "🎬".repeat(2000);
    expect(validatePublishOptions("youtube", { description: emoji })[0]).toMatch(
      /8000 bytes/,
    );
    expect(validatePublishOptions("youtube", { description: "short" })).toEqual([]);
  });

  it("passes a valid set", () => {
    expect(
      validatePublishOptions("youtube", {
        privacy_status: "unlisted",
        title: "A fine title",
        made_for_kids: "no",
      }),
    ).toEqual([]);
  });
});

describe("optionValue", () => {
  it("falls back to the declared default", () => {
    expect(optionValue("youtube", {}, "privacy_status")).toBe("public");
    expect(optionValue("instagram", undefined, "share_to_feed")).toBe(true);
  });

  it("returns undefined for text with nothing in it, so the adapter decides", () => {
    expect(optionValue("youtube", {}, "title")).toBeUndefined();
  });

  it("returns undefined for a field the platform does not have", () => {
    expect(optionValue("x", {}, "privacy_status")).toBeUndefined();
  });
});
