import { describe, expect, it } from "vitest";

import { parseBlocks, parseInline } from "./markdown";

describe("parseInline", () => {
  it("finds bold and leaves the surrounding text alone", () => {
    expect(parseInline("say **this** loudly")).toEqual([
      { text: "say " },
      { bold: true, text: "this" },
      { text: " loudly" },
    ]);
  });

  it("reads bold before italic", () => {
    // The whole reason `**` is tried first: an italic-first pass eats the
    // opening asterisk of every bold marker and the rest of the line renders
    // wrong from there.
    expect(parseInline("**bold**")).toEqual([{ bold: true, text: "bold" }]);
  });

  it("handles underscores as well as asterisks", () => {
    expect(parseInline("__b__ and _i_")).toEqual([
      { bold: true, text: "b" },
      { text: " and " },
      { italic: true, text: "i" },
    ]);
  });

  it("leaves an unmatched marker as a literal character", () => {
    // A lone asterisk in a script is a lone asterisk. Treating it as an
    // unterminated marker would swallow the rest of the line.
    expect(parseInline("2 * 3 = 6")).toEqual([{ text: "2 * 3 = 6" }]);
  });

  it("keeps markup as text, because there is no HTML path here", () => {
    // Model output ultimately comes from a video somebody else uploaded. It is
    // returned as React children, never as innerHTML, so a tag stays a tag.
    expect(parseInline("<script>alert(1)</script>")).toEqual([
      { text: "<script>alert(1)</script>" },
    ]);
  });
});

describe("parseBlocks", () => {
  it("reads headings and caps them at three levels", () => {
    expect(parseBlocks("# One\n##### Five")).toEqual([
      { kind: "heading", level: 1, text: "One" },
      { kind: "heading", level: 3, text: "Five" },
    ]);
  });

  it("does not treat a hash with no space as a heading", () => {
    expect(parseBlocks("#hashtag")).toEqual([
      { kind: "paragraph", lines: ["#hashtag"] },
    ]);
  });

  it("groups bullets into one list", () => {
    expect(parseBlocks("- a\n- b")).toEqual([
      { kind: "list", ordered: false, items: ["a", "b"] },
    ]);
  });

  it("groups numbers into an ordered list", () => {
    expect(parseBlocks("1. a\n2) b")).toEqual([
      { kind: "list", ordered: true, items: ["a", "b"] },
    ]);
  });

  it("starts a new list when the marker kind changes", () => {
    expect(parseBlocks("- a\n1. b")).toEqual([
      { kind: "list", ordered: false, items: ["a"] },
      { kind: "list", ordered: true, items: ["b"] },
    ]);
  });

  it("does not swallow the paragraph after a list", () => {
    expect(parseBlocks("- a\nplain")).toEqual([
      { kind: "list", ordered: false, items: ["a"] },
      { kind: "paragraph", lines: ["plain"] },
    ]);
  });

  it("splits paragraphs on a blank line and keeps soft breaks inside one", () => {
    expect(parseBlocks("one\ntwo\n\nthree")).toEqual([
      { kind: "paragraph", lines: ["one", "two"] },
      { kind: "paragraph", lines: ["three"] },
    ]);
  });

  it("normalises Windows line endings", () => {
    expect(parseBlocks("a\r\n\r\nb")).toEqual([
      { kind: "paragraph", lines: ["a"] },
      { kind: "paragraph", lines: ["b"] },
    ]);
  });

  it("returns nothing for empty output", () => {
    expect(parseBlocks("")).toEqual([]);
  });
});
