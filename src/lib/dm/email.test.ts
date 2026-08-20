import { describe, expect, it } from "vitest";

import { extractEmail } from "./email";

describe("extractEmail", () => {
  it("finds an address inside a sentence", () => {
    expect(extractEmail("sure it's Me@Example.com thanks!!")).toBe(
      "me@example.com",
    );
  });

  it("drops sentence punctuation stuck to the end", () => {
    expect(extractEmail("email me at a@b.co.")).toBe("a@b.co");
  });

  it("survives the invisible characters phone keyboards insert", () => {
    expect(extractEmail("a​b@example.com")).toBe("ab@example.com");
  });

  it("returns null when there is no address", () => {
    // The important case: a rule that stored this as an email address would
    // poison the very export it exists to fill.
    expect(extractEmail("sure thanks")).toBeNull();
    expect(extractEmail("@handle")).toBeNull();
    expect(extractEmail("")).toBeNull();
  });

  it("rejects a domain that is not a domain", () => {
    expect(extractEmail("me@-bad.com")).toBeNull();
    expect(extractEmail("me@localhost")).toBeNull();
  });

  it("keeps plus-addressing", () => {
    expect(extractEmail("yes: a+tag@example.co.uk")).toBe("a+tag@example.co.uk");
  });
});
