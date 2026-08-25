"use client";

import { useEffect, type MouseEvent } from "react";

import { cx } from "./ui";

// The three dialogs in the app were each written on their own, and the
// differences between them were accidents rather than decisions: one closed on
// Escape and two did not, one dimmed to 35% and the others to 40% and 60%, one
// checked the backdrop on `mousedown` and the others on `click`.
//
// That last one is a real bug and not a style difference. Selecting text
// inside a dialog and releasing the button outside it fires a `click` whose
// `target` is the backdrop, so the dialog closes and takes the selection with
// it. `mousedown` cannot be fooled that way: the press either started on the
// backdrop or it did not.

/** Escape closes. Bound to the window so it works before anything inside the
 *  dialog has been focused. */
export function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}

/**
 * The backdrop. `layout` picks where the panel sits: `centre` for a dialog at
 * any width, `sheet` for one that rises from the bottom edge of a phone and
 * becomes a centred dialog above the `shell` breakpoint.
 */
export function overlayProps(
  onClose: () => void,
  layout: "centre" | "sheet" = "centre",
  /** The stacking layer, which is the caller's to know: the schedule dialog
   *  opens over the composer's own sticky action bar and has to clear it.
   *  Passed rather than overridden, because two `z-*` utilities in one class
   *  string are settled by CSS source order and not by which one was
   *  written last. */
  className?: string,
) {
  return {
    className: cx(
      "mf-overlay fixed inset-0 flex justify-center bg-black/45 backdrop-blur-[2px]",
      layout === "sheet"
        ? "items-end p-0 shell:items-center shell:p-6"
        : "items-center p-4",
      className,
    ),
    onMouseDown: (event: MouseEvent<HTMLElement>) => {
      if (event.target === event.currentTarget) onClose();
    },
  };
}
