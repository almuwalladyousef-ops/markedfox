"use client";

import { useEffect } from "react";

// A deploy replaces every chunk under a new hash, so a tab that was already
// open holds URLs that no longer exist. The next thing it tries to load 404s,
// React unmounts the tree, and the error boundary shows a person a dead screen
// telling them to reload a page that was working a second ago.
//
// A stale tab does not need to be told to reload. It needs to reload. The
// boundaries call `useStaleBuildReload` and otherwise render as they would for
// any other fault — if the reload fires, the screen is at most a blink.

/** The shapes a "your build is out of date" failure arrives in, across
 *  browsers and across the two ways Next can load code. */
export function isStaleBuildError(error: Error): boolean {
  const name = error.name ?? "";
  const message = error.message ?? "";
  if (name === "ChunkLoadError") return true;
  return [
    "Loading chunk",
    "Failed to load chunk",
    "Loading CSS chunk",
    // Chrome, Firefox and Safari each word this one differently.
    "Failed to fetch dynamically imported module",
    "error loading dynamically imported module",
    "Importing a module script failed",
    "Unable to load script",
  ].some((fragment) => message.includes(fragment));
}

/** Reload at most once per window of time, so a genuinely broken build cannot
 *  put the browser in a refresh loop — the second failure shows the screen. */
const RELOAD_MARK = "mf:auto-reloaded-at";
const RELOAD_COOLDOWN_MS = 20_000;

export function reloadOnce(): void {
  if (typeof window === "undefined") return;
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_MARK) ?? 0);
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return;
    window.sessionStorage.setItem(RELOAD_MARK, String(Date.now()));
  } catch {
    // Private mode, or storage disabled. One reload without a guard is still
    // better than a dead page; the browser's own loop protection is the floor.
  }
  window.location.reload();
}

/** For error boundaries: reload once if the error means the tab is holding a
 *  build that no longer exists, and do nothing otherwise. */
export function useStaleBuildReload(error: Error): void {
  useEffect(() => {
    if (isStaleBuildError(error)) reloadOnce();
  }, [error]);
}
