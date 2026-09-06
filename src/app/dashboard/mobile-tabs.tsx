"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "@/components/icons";
import { cx } from "@/components/ui";
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
// Every hit target here is at least 44px.

export function MobileTabs({ avatarUrl }: { avatarUrl?: string | null }) {
  const pathname = usePathname();
  const active = activeMobileTab(pathname);
  const creating = isMobileCreate(pathname);

  const tab = (item: MobileTab) => {
    const on = item.id === active;
    return (
      <Link
        key={item.id}
        href={item.href}
        title={item.tip}
        aria-label={item.tip}
        aria-current={on ? "page" : undefined}
        className={cx(
          "flex min-h-[44px] min-w-[56px] flex-1 flex-col items-center justify-center gap-1 px-1 text-[10.5px] font-bold transition-[color,scale] duration-110 active:scale-[0.94]",
          on ? "text-ink" : "text-muted",
        )}
      >
        {item.id === "account" && avatarUrl ? (
          // The user's own picture, exactly as the reference does it. A plain
          // <img>: avatars come from whichever CDN each platform uses this
          // month, and next/image would need every one whitelisted to do
          // nothing but proxy an image we never resize.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt=""
            className={cx(
              "h-[23px] w-[23px] rounded-full object-cover",
              on ? "ring-2 ring-ink" : "ring-1 ring-line",
            )}
          />
        ) : (
          <Icon
            name={item.icon}
            className={cx("h-[22px] w-[22px]", on ? "" : "opacity-75")}
            strokeWidth={on ? 2.2 : 1.8}
          />
        )}
        {item.label}
      </Link>
    );
  };

  return (
    <nav
      aria-label="Main"
      className="fixed right-0 bottom-0 left-0 z-[45] flex items-stretch justify-around border-t border-line bg-panel/95 px-1.5 pt-2 pb-[calc(14px+env(safe-area-inset-bottom))] backdrop-blur-md shell:hidden"
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
