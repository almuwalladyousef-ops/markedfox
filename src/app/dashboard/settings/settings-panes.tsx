"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { Icon } from "@/components/icons";
import { StickyPane, TwoPane } from "@/components/ui";

const INDEX = "/dashboard/settings";

// Settings is two panes side by side on a desktop and two SCREENS on a phone
// (owner decision, 2026-09-06).
//
// Both panes used to render at every width. Above `wide` that is the intended
// layout; below it `TwoPane` stacks, so opening Terms and privacy left the
// thirteen-row menu filling the screen with the thing you asked for parked
// underneath it — you had to scroll past the menu to read what you pressed.
//
// So on a phone exactly one of them is on screen: the menu at /dashboard/
// settings, the chosen pane anywhere below it, with a back link that returns
// to the menu. That is how a phone settings app has always worked, and it is
// why the index no longer redirects to Connected accounts — the menu had to
// become somewhere you can actually be.
//
// The pathname decides, not a media query, because only CSS knows the width
// and only the router knows the route; the two `wide:` classes below are what
// hands the decision back to CSS above the breakpoint.

export function SettingsPanes({
  menu,
  children,
}: {
  menu: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const atIndex = pathname === INDEX;

  return (
    <TwoPane>
      <StickyPane
        className={
          atIndex
            ? "min-w-[300px] flex-[0_1_312px]"
            : "hidden min-w-[300px] flex-[0_1_312px] wide:block"
        }
      >
        {menu}
      </StickyPane>

      <div
        className={
          atIndex
            ? "hidden min-w-[min(100%,440px)] flex-[1_1_520px] wide:block"
            : "min-w-[min(100%,440px)] flex-[1_1_520px]"
        }
      >
        {!atIndex ? (
          <Link
            href={INDEX}
            className="mb-4 -ml-1 inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-[14px] font-semibold text-muted transition-[color] duration-110 hover:text-ink wide:hidden"
          >
            <Icon name="chevronLeft" className="h-4 w-4" />
            Settings
          </Link>
        ) : null}
        {children}
      </div>
    </TwoPane>
  );
}
