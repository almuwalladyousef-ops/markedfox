"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { cx } from "./ui";

// The dock is icon-only, so its labels live entirely in a tooltip — which
// until now was the browser's own `title` attribute. That is not a styled
// element: it waits about a second, ignores the theme, renders in the OS's
// font, never appears for keyboard users, and cannot be positioned. For the
// app's primary navigation that is not good enough.
//
// Two behaviours make a tooltip feel right, and both are here:
//
//  1. A delay before the first one, so brushing past an icon on the way
//     somewhere else does not flash a label.
//  2. No delay, and no animation, on the next one. Once a person is reading
//     tooltips, the delay they asked for the first time is friction every
//     time after, and moving down a rail of five icons should feel like the
//     label is following the pointer rather than being re-summoned.
//
// The second is why this is shared module state rather than per-component
// state: "did another tooltip just close" is a fact about the rail, not about
// any one item in it.

const OPEN_DELAY = 500;
/** How long after one closes that the next opens instantly. */
const INSTANT_WINDOW = 400;

let lastClosedAt = 0;

type Side = "right" | "top";

export function Tooltip({
  label,
  side = "right",
  children,
  className,
}: {
  label: string;
  side?: Side;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [instant, setInstant] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const show = (immediate: boolean) => {
    if (timer.current) clearTimeout(timer.current);
    const skipDelay = immediate || Date.now() - lastClosedAt < INSTANT_WINDOW;
    setInstant(skipDelay);
    if (skipDelay) {
      setOpen(true);
      return;
    }
    timer.current = setTimeout(() => setOpen(true), OPEN_DELAY);
  };

  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    if (open) lastClosedAt = Date.now();
    setOpen(false);
  };

  return (
    <span
      className={cx("relative inline-flex", className)}
      // Pointer events rather than mouse ones, gated on a real mouse: a touch
      // reports itself as a hover on the way to a tap, which would flash a
      // label over the thing the finger is already pressing.
      onPointerEnter={(event) => {
        if (event.pointerType !== "mouse") return;
        show(false);
      }}
      onPointerLeave={hide}
      // A keyboard user gets the label at once — they arrived here
      // deliberately, so there is nothing to protect them from.
      onFocus={() => show(true)}
      onBlur={hide}
      // Pressing the thing means the label has done its job.
      onPointerDown={hide}
    >
      {children}
      {open ? (
        <span
          role="tooltip"
          className={cx(
            // `bg-ink` on `text-bg`, not the dock's own colours: in dark
            // `--dock` is the same value as `--panel`, so a dock-coloured pill
            // over the panel-coloured rail was a label you had to look for.
            // The ink pair inverts with the theme and is the one surface in
            // the app guaranteed to contrast with whatever is behind it.
            "pointer-events-none absolute z-[70] rounded-lg bg-ink px-2.5 py-1.5 text-[12.5px] font-semibold whitespace-nowrap text-bg shadow-[0_6px_20px_rgba(0,0,0,.28)]",
            // The origin is the trigger, not the tooltip's own centre — a
            // label that grows out of the icon it belongs to reads as
            // attached to it.
            side === "right"
              ? "top-1/2 left-full ml-2.5 -translate-y-1/2 origin-left"
              : "bottom-full left-1/2 mb-2.5 -translate-x-1/2 origin-bottom",
            // Skipping the animation, not just the delay: the second tooltip
            // in a row should already be there.
            instant ? null : "mf-tooltip-in",
          )}
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}
