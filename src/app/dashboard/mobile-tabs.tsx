"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Below 880px the sidebar is gone, so the five things people do most often
// become a fixed bottom bar. Compose is the raised centre button rather than a
// sixth equal tab, because it is the one destination that starts work rather
// than reviewing it.

const TABS = [
  { href: "/dashboard/calendar", label: "Calendar", icon: "▤" },
  { href: "/dashboard/posts", label: "Posts", icon: "◫" },
  { href: "/dashboard/automations", label: "Autos", icon: "⚡" },
  { href: "/dashboard/research", label: "Videos", icon: "▶" },
] as const;

function PencilIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

export function MobileTabs() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const tab = (item: (typeof TABS)[number]) => (
    <Link
      key={item.href}
      href={item.href}
      aria-current={isActive(item.href) ? "page" : undefined}
      className={`flex min-w-[44px] flex-col items-center gap-[3px] px-2.5 py-1 text-[10px] font-semibold transition ${
        isActive(item.href) ? "text-accent" : "text-muted"
      }`}
    >
      <span aria-hidden className="text-[17px]">
        {item.icon}
      </span>
      {item.label}
    </Link>
  );

  return (
    <nav className="fixed right-0 bottom-0 left-0 z-[45] flex items-stretch justify-around border-t border-line bg-panel px-2 pt-2 pb-[calc(8px+env(safe-area-inset-bottom))] shell:hidden">
      {TABS.slice(0, 2).map(tab)}
      <Link
        href="/dashboard/compose"
        aria-label="Compose"
        className="-mt-[22px] flex h-[52px] w-[52px] items-center justify-center rounded-full bg-accent text-accent-ink shadow-panel"
      >
        <PencilIcon />
      </Link>
      {TABS.slice(2).map(tab)}
    </nav>
  );
}
