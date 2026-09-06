"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { Icon } from "@/components/icons";
import { PageHeader, StickyPane, TwoPane } from "@/components/ui";

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
    <>
      {/* "Settings" is the title of the MENU, not of every pane behind it. On
          a phone, opening Connected accounts made a screen headed "Settings"
          with "Connected accounts" as a subheading under it — the wrong thing
          in the biggest type on the page. Below `wide` the word belongs to the
          index and to the back link; the pane's own heading takes over. */}
      <div className={atIndex ? "" : "hidden wide:block"}>
        <PageHeader title="Settings" />
      </div>

      <TwoPane>
        <StickyPane
          // `flex-[0_1_312px]` is the DESKTOP column width. On a phone the menu
          // is the whole screen, and that basis was capping it at 312px inside
          // a 358px row — the empty strip down the right-hand side.
          className={
            atIndex
              ? "w-full wide:min-w-[300px] wide:flex-[0_1_312px]"
              : "hidden wide:block wide:min-w-[300px] wide:flex-[0_1_312px]"
          }
        >
          {menu}
        </StickyPane>

        <div
          className={
            atIndex
              ? "hidden w-full wide:block wide:min-w-[min(100%,440px)] wide:flex-[1_1_520px]"
              : "w-full wide:min-w-[min(100%,440px)] wide:flex-[1_1_520px]"
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
    </>
  );
}
