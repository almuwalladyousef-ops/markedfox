"use client";

import { useState } from "react";

import { Icon } from "@/components/icons";
import { Notice, cx } from "@/components/ui";
import type { PillTone } from "@/components/ui";

// A notice that says one line until you ask for the rest.
//
// The account-read failures on Home are the case this exists for. Several
// platforms failing at once produced a paragraph of raw provider messages —
// "Malformed token envelope: expected v1.<iv>.<ciphertext>.<tag>" and its
// friends — which on a phone pushed the entire profile header below the fold
// on the screen the app opens on. The information is worth keeping and worth
// hiding: nobody reads a provider's exception on the way to their own posts,
// and the person who does need it needs all of it.
//
// So the summary is ours and the detail is theirs. Collapsed by default,
// because the common case is glancing at Home and moving on.

export function CollapsibleNotice({
  tone = "neutral",
  summary,
  children,
}: {
  tone?: PillTone;
  /** The one line always shown. Written by us, not by the platform. */
  summary: string;
  /** The full text, revealed on press. */
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Notice tone={tone} className="p-0 text-[13px]/[19px]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        // Deliberately tight. Collapsed, this is one line of status sitting
        // between the header and the person's own screen, and a notice with
        // card-sized padding reads as a section of the page rather than as a
        // line about it.
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] transition-[background-color] duration-110"
      >
        <span className="min-w-0 flex-1 truncate font-semibold">{summary}</span>
        <Icon
          name="chevronDown"
          className={cx(
            "h-4 w-4 shrink-0 transition-transform duration-160",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div className="px-3 pt-0.5 pb-3 text-pretty">{children}</div>
      ) : null}
    </Notice>
  );
}
