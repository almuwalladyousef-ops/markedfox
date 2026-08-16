import { describe, expect, it } from "vitest";

import { containsExternalLink } from "./links";

// The 13x cost control. Flagging is the safe direction: a false positive costs
// the user a rewrite, a miss costs $0.185 on every repeat.
describe("containsExternalLink", () => {
  it.each([
    "check https://markedfox.com today",
    "http://example.com",
    "HTTPS://EXAMPLE.COM/path?x=1",
    "www.example.com is live",
    "new post at markedfox.com",
    "visit example.com.",
    "(example.io)",
    "see: sub.example.co.uk/path",
    "🔥example.dev",
    "instagram.com/markedfox",
    "Example.COM",
    "our shop 👉 shop.example.store",
  ])("flags %j", (caption) => {
    expect(containsExternalLink(caption)).toBe(true);
  });

  it.each([
    "",
    "no links here",
    "built with node.js and next.js",
    "e.g. this, i.e. that, a.m. and p.m.",
    "version 2.0.1 shipped",
    "3.5 stars",
    "follow @markedfox.official",
    "mail hi@example.com for support", // X does not link emails
    "Ph.D. in U.S. history",
    "wait...what",
    "#hashtag.only",
    "St.Louis", // 'louis' is not a TLD
  ])("leaves %j alone", (caption) => {
    expect(containsExternalLink(caption)).toBe(false);
  });
});
