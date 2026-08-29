import { describe, expect, it } from "vitest";

import { isStaleBuildError } from "./stale-build";

// The whole point of the boundary is telling these two apart: a tab holding
// URLs from a build that no longer exists should reload itself, and a real
// fault should stop and say so.
describe("isStaleBuildError", () => {
  const err = (message: string, name?: string) => {
    const e = new Error(message);
    if (name) e.name = name;
    return e;
  };

  it("recognises a webpack chunk failure by name", () => {
    expect(isStaleBuildError(err("anything", "ChunkLoadError"))).toBe(true);
  });

  it("recognises the wording each browser uses for a failed module import", () => {
    for (const message of [
      "Loading chunk 402 failed.",
      "Failed to load chunk server/chunks/ssr/src_1q9rin3._.js",
      "Loading CSS chunk 7 failed.",
      // Chrome
      "Failed to fetch dynamically imported module: https://markedfox.com/_next/x.js",
      // Firefox
      "error loading dynamically imported module",
      // Safari
      "Importing a module script failed.",
    ]) {
      expect(isStaleBuildError(err(message)), message).toBe(true);
    }
  });

  // A real bug must not be answered with a refresh — that would hide it and,
  // if it reproduced on load, spin the browser.
  it("leaves ordinary failures alone", () => {
    for (const message of [
      "Cannot read properties of undefined (reading 'map')",
      "Malformed token envelope",
      "Network request failed",
      "chunk",
    ]) {
      expect(isStaleBuildError(err(message)), message).toBe(false);
    }
  });
});
