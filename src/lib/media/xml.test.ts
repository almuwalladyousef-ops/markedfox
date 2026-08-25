import { describe, expect, it } from "vitest";

import { decodeXml, escapeXml } from "./xml";

describe("XML entities on the multipart round trip", () => {
  // The exact shape R2's ListParts hands back.
  it("decodes an ETag's quoted form to the literal value", () => {
    expect(decodeXml("&quot;9d1e5a3c&quot;")).toBe('"9d1e5a3c"');
  });

  it("round-trips an ETag through decode and escape unchanged", () => {
    const fromR2 = "&quot;9d1e5a3c-2&quot;";
    expect(escapeXml(decodeXml(fromR2))).toBe('"9d1e5a3c-2"');
  });

  // Double-escaping is the bug this file exists for: without the decode, the
  // `&` of `&quot;` is escaped again and R2 reports the part as missing.
  it("does not double-escape what it was given", () => {
    expect(escapeXml("&quot;abc&quot;")).toBe("&amp;quot;abc&amp;quot;");
    expect(escapeXml(decodeXml("&quot;abc&quot;"))).toBe('"abc"');
  });

  it("decodes the ampersand last, so a nested entity survives", () => {
    expect(decodeXml("&amp;quot;")).toBe("&quot;");
  });

  it("escapes the three characters that need it and nothing else", () => {
    expect(escapeXml("a&b<c>d\"e'f")).toBe("a&amp;b&lt;c&gt;d\"e'f");
  });
});
