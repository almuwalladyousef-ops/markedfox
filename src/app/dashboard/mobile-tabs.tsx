"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon, type IconName } from "@/components/icons";
import { cx } from "@/components/ui";

// Below 880px the sidebar is gone, so the four things people do most often
// become a fixed bottom bar with compose raised between them. Compose is not a
// fifth equal tab because it is the one destination that starts work rather
// than reviewing it — and because a raised circle is reachable with a thumb on
// a phone the size people actually own.
//
// Every hit target here is at least 44px.

const TABS: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/dashboard", label: "Home", icon: "home" },
  { href: "/dashboard/calendar", label: "Calendar", icon: "calendar" },
  { href: "/dashboard/automations", label: "Autos", icon: "automations" },
  { href: "/dashboard/research", label: "Videos", icon: "videos" },
];

export function MobileTabs() {
  const pathname = usePathname();
  // Home is the one exact match: every other dashboard path starts with
  // /dashboard, so a prefix test would light Home on every screen.
  const isActive = (href: string) =>
    href === "/dashboard"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);

  const tab = (item: (typeof TABS)[number]) => {
    const active = isActive(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cx(
          "flex min-h-[44px] min-w-[56px] flex-col items-center justify-center gap-1 px-2 text-[11px] font-semibold transition-[color] duration-150",
          active ? "text-accent" : "text-muted",
        )}
      >
        <Icon
          name={item.icon}
          className={cx("h-[21px] w-[21px]", active ? "" : "opacity-75")}
        />
        {item.label}
      </Link>
    );
  };

  return (
    <nav className="fixed right-0 bottom-0 left-0 z-[45] flex items-stretch justify-around border-t border-line bg-panel px-2.5 pt-2.5 pb-[calc(16px+env(safe-area-inset-bottom))] shell:hidden">
      {TABS.slice(0, 2).map(tab)}
      <Link
        href="/dashboard/new-post"
        aria-label="New post"
        className="-mt-6 flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink shadow-[0_10px_24px_rgba(234,88,12,.35)]"
      >
        <Icon name="plus" className="h-6 w-6" strokeWidth={2.2} />
      </Link>
      {TABS.slice(2).map(tab)}
    </nav>
  );
}
