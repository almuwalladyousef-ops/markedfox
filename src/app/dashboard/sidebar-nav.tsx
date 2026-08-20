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
    <nav className="flex flex-col gap-5">
      {sections.map((section) => (
        <div key={section.title}>
          <p className="px-3 text-[10px] font-semibold tracking-widest text-neutral-600 uppercase">
            {section.title}
          </p>
          <ul className="mt-1.5 flex flex-col gap-0.5">
            {section.items.map((item) => {
              const active = item.href === activeHref;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition ${
                      active
                        ? "bg-neutral-900 font-medium text-neutral-50"
                        : "text-neutral-400 hover:bg-neutral-900/60 hover:text-neutral-200"
                    }`}
                  >
                    <span aria-hidden className="w-4 text-center text-neutral-500">
                      {item.icon}
                    </span>
                    <span className="truncate">{item.label}</span>
                    {item.locked ? (
                      <span className="ml-auto text-[10px]" title="Not on your plan">
                        💎
                      </span>
                    ) : item.badge ? (
                      <span className="ml-auto rounded-full bg-neutral-800 px-1.5 py-0.5 text-[10px] font-medium text-neutral-300">
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
