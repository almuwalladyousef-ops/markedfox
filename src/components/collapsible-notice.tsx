"use client";

import { useState } from "react";

import { Icon } from "@/components/icons";
import { cx } from "@/components/ui";
import type { PillTone } from "@/components/ui";

// A status marker that costs almost nothing until you press it.
//
// The account-read failures on Home are the case this exists for, and it has
// shrunk twice. First it was a paragraph of raw provider messages. Then it was
// a full-width tinted bar with one line in it — still a block of colour across
// the top of the screen the app opens on, still announcing a problem the
// person has probably already seen.
//
// It is now a dot, a count and a chevron (owner decision, 2026-09-06). Nothing
// is a sentence until it is opened. The dot carries the tone, which is the
// part a glance actually reads; a number says how much there is; the chevron
// says there is more. Everything else was the screen talking about itself
// instead of showing the person their own work.
//
// Open, it becomes an ordinary tinted block, because at that point they have
// asked and the words are the point.

const DOT: Record<PillTone, string> = {
  neutral: "bg-faint",
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
  info: "bg-sky",
  accent: "bg-accent",
};

const TEXT: Record<PillTone, string> = {
  neutral: "text-muted",
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
  info: "text-sky",
  accent: "text-accent",
};

export function CollapsibleNotice({
  tone = "neutral",
  summary,
  count,
  children,
}: {
  tone?: PillTone;
  /** Read out to screen readers and shown once opened. Never rendered as the
   *  collapsed label — collapsed, this control is deliberately almost silent. */
  summary: string;
  /** How many things are wrong. The one number worth a glance. */
  count?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cx("-mt-1", open && "rounded-lg bg-warn-soft")}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={summary}
        title={summary}
        className={cx(
          "flex items-center gap-1.5 rounded-md py-1 pr-1.5 text-[12px] font-semibold transition-[color] duration-110",
          open ? "px-3 pt-2" : "px-0",
          TEXT[tone],
        )}
      >
        <span
          aria-hidden
          className={cx("h-[7px] w-[7px] shrink-0 rounded-full", DOT[tone])}
        />
        {typeof count === "number" ? (
          <span>
            {count} {count === 1 ? "issue" : "issues"}
          </span>
        ) : (
          <span>Issue</span>
        )}
        <Icon
          name="chevronDown"
          className={cx(
            "h-3.5 w-3.5 shrink-0 transition-transform duration-160",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div className="px-3 pt-0.5 pb-3 text-[13px]/[19px] text-pretty text-ink">
          {children}
        </div>
      ) : null}
    </div>
  );
}
