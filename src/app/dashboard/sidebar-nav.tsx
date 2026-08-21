"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The nav. A client component only because the active item is decided by the
// current path, and highlighting the wrong row is worse than shipping a few
// kilobytes of JavaScript.

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  /** Shown as a count on the right, the way an inbox shows unread. */
  badge?: number;
  /** Outside the plan: still rendered, wearing a 💎. Never hidden. */
  locked?: boolean;
};

export type NavSection = { title: string; items: NavItem[] };

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  // A child route keeps its parent lit: /dashboard/research/abc belongs to
  // Videos. Guard on the boundary so /research does not also light
  // /research-something-else.
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();

  // Longest match wins, so /dashboard/research/projects lights Projects and
  // not Videos, whose href is a prefix of it.
  const activeHref = sections
    .flatMap((section) => section.items)
    .filter((item) => isActive(pathname, item.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-0.5">
      {sections.map((section) => (
        <div key={section.title}>
          <p className="px-2.5 text-[9.5px] font-bold tracking-[0.12em] text-faint uppercase">
            {section.title}
          </p>
          <ul className="mt-[5px] flex flex-col gap-px">
            {section.items.map((item) => {
              const active = item.href === activeHref;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-[9px] rounded-lg px-2.5 py-1.5 text-[13px] transition ${
                      active
                        ? "bg-accent-soft font-semibold text-accent"
                        : "font-medium text-muted hover:text-ink"
                    }`}
                  >
                    <span
                      aria-hidden
                      className="w-[15px] shrink-0 text-center text-xs text-faint"
                    >
                      {item.icon}
                    </span>
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.locked ? (
                      <span className="text-[10px]" title="Not on your plan">
                        💎
                      </span>
                    ) : item.badge ? (
                      <span className="rounded-full bg-chip px-[7px] py-px text-[10px] font-semibold text-muted">
                        {item.badge > 99 ? "99+" : item.badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
