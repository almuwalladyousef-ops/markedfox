"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "@/components/icons";
import { cx } from "@/components/ui";
import { activeSpace, SHELL_SPACES } from "@/lib/shell";

// Below 880px the dock becomes this bar: the three spaces with the New post
// FAB raised between Home and Automate, exactly the dock's own order. The FAB
// is not a fourth equal tab because it is the one control that starts work
// rather than reviewing it.
//
// Every hit target here is at least 44px.

export function MobileTabs() {
  const pathname = usePathname();
  const onSettings = pathname.startsWith("/dashboard/settings");
  const spaceId = activeSpace(pathname).id;

  const tab = (space: (typeof SHELL_SPACES)[number]) => {
    const rows = space.rows.filter((row) => "href" in row);
    const first = rows[0] as { href: string };
    const active = !onSettings && space.id === spaceId;
    return (
      <Link
        key={space.id}
        href={first.href}
        title={space.tip}
        aria-current={active ? "page" : undefined}
        className={cx(
          "flex min-h-[44px] min-w-[56px] flex-col items-center justify-center gap-1 px-2 text-[10.5px] font-bold transition-[color] duration-150",
          active ? "text-accent" : "text-muted",
        )}
      >
        <Icon
          name={space.icon}
          className={cx("h-[21px] w-[21px]", active ? "" : "opacity-75")}
        />
        {space.label}
      </Link>
    );
  };

  return (
    <nav className="fixed right-0 bottom-0 left-0 z-[45] flex items-stretch justify-around border-t border-line bg-panel/95 px-2.5 pt-2 pb-[calc(14px+env(safe-area-inset-bottom))] backdrop-blur-md shell:hidden">
      {tab(SHELL_SPACES[0])}
      <Link
        href="/dashboard/new-post"
        aria-label="New post"
        title="New post — the composer"
        className="-mt-[22px] flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-[18px] bg-accent text-accent-ink shadow-[0_10px_24px_var(--accent-glow)]"
      >
        <Icon name="plus" className="h-[23px] w-[23px]" strokeWidth={2.2} />
      </Link>
      {SHELL_SPACES.slice(1).map(tab)}
    </nav>
  );
}
