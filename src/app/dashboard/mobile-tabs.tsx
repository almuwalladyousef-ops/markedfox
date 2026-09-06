"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AvatarImage } from "@/components/avatar-image";
import { Icon } from "@/components/icons";
import { cx } from "@/components/ui";

import { useSectionMenu } from "./section-menu";
import {
  MOBILE_CREATE,
  MOBILE_TABS,
  activeMobileTab,
  isMobileCreate,
  type MobileTab,
} from "@/lib/mobile-nav";

// Below 880px the dock becomes this bar. It is NOT the dock's three spaces:
// the phone gets four flat destinations with the composer raised between the
// second and third, which is the reference's own shape —
//
//   Home · Drafts · [ + ] · Feed · Account
//
// Two consequences worth stating. Drafts is one tap from anywhere instead of
// two (Home space → Drafts row), and Account carries the profile picture
// rather than a glyph, because on a phone the account tab is the one place a
// person expects to see themselves.
//
// Icons only, no labels (owner decision, 2026-09-06). Five destinations whose
// meanings a phone user already knows, and the words were costing a row of
// 10.5px text under every one of them. Each label survives as the accessible
// name and the tooltip, so a screen reader still announces "Automate — your DM
// and comment rules" rather than a bare graphic.
//
// The targets are flex-1 with no min-width, so the five of them divide the
// screen exactly and the row reaches both edges instead of huddling.
//
// Every hit target here is at least 44px.

export function MobileTabs({ avatarUrl }: { avatarUrl?: string | null }) {
  const pathname = usePathname();
  const active = activeMobileTab(pathname);
  const creating = isMobileCreate(pathname);
  const menu = useSectionMenu();

  const tab = (item: MobileTab) => {
    const on = item.id === active;
    // Pressing the tab you are already on opens that section's pages, which is
    // what a phone does everywhere else. The convention is invisible, so the
    // tab carries a chevron while it has a menu — the same hint a bottom sheet
    // uses to say it can be pulled up.
    const opensMenu = on && menu.hasMenu;

    const face = (
      <>
        {opensMenu ? (
          <Icon
            name="chevronUp"
            className="absolute top-1 h-3 w-3 opacity-60"
            strokeWidth={2.6}
          />
        ) : null}
        {item.id === "account" ? (
          // The user's own picture, exactly as the reference does it, falling
          // back to the same glyph every other tab uses when the URL is empty
          // or dead.
          <AvatarImage
            src={avatarUrl}
            className={cx(
              "h-[26px] w-[26px] rounded-full object-cover",
              on ? "ring-2 ring-ink" : "ring-1 ring-line",
            )}
            fallback={
              <Icon
                name={item.icon}
                className={cx("h-[25px] w-[25px]", on ? "" : "opacity-70")}
                strokeWidth={on ? 2.2 : 1.7}
              />
            }
          />
        ) : (
          <Icon
            name={item.icon}
            className={cx("h-[25px] w-[25px]", on ? "" : "opacity-70")}
            strokeWidth={on ? 2.2 : 1.7}
          />
        )}
      </>
    );

    const shell = cx(
      "relative flex min-h-[52px] flex-1 items-center justify-center transition-[color,scale] duration-110 active:scale-[0.9]",
      on ? "text-ink" : "text-muted",
    );

    // A button, not a link, when it opens the sheet: it navigates nowhere, and
    // a link that does not navigate lies to a long-press and to the status bar.
    return opensMenu ? (
      <button
        key={item.id}
        type="button"
        onClick={menu.open}
        aria-haspopup="dialog"
        aria-label={`${item.label} — show its pages`}
        title={`${item.label} — show its pages`}
        className={shell}
      >
        {face}
      </button>
    ) : (
      <Link
        key={item.id}
        href={item.href}
        title={item.tip}
        aria-label={item.tip}
        aria-current={on ? "page" : undefined}
        className={shell}
      >
        {face}
      </Link>
    );
  };

  return (
    <nav
      aria-label="Main"
      className="fixed right-0 bottom-0 left-0 z-[45] flex items-stretch border-t border-line bg-panel/95 px-1 pt-2 pb-[calc(12px+env(safe-area-inset-bottom))] backdrop-blur-md shell:hidden"
    >
      {MOBILE_TABS.slice(0, 2).map(tab)}

      <Link
        href={MOBILE_CREATE.href}
        aria-label={MOBILE_CREATE.tip}
        aria-current={creating ? "page" : undefined}
        title={MOBILE_CREATE.tip}
        // The largest target in the app, and the only one that had no answer
        // to being pressed. On a phone there is no hover state to fall back
        // on, so the press scale is the entire feedback.
        className={cx(
          "mx-1 -mt-5 flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-2xl shadow-e2 transition-transform duration-110 active:scale-[0.92]",
          creating ? "bg-ink text-panel" : "bg-accent text-accent-ink",
        )}
      >
        <Icon name="plus" className="h-[23px] w-[23px]" strokeWidth={2.2} />
      </Link>

      {MOBILE_TABS.slice(2).map(tab)}
    </nav>
  );
}
