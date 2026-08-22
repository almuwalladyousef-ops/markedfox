"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cx } from "@/components/ui";

// The nav. A client component only because the active item is decided by the
// current path, and highlighting the wrong row is worse than shipping a few
// kilobytes of JavaScript.
//
// Two widths: open, where every row is an icon tile and a label, and
// collapsed, where the labels go and the tiles become the whole control. The
// collapsed rail keeps the same tiles in the same order and the same vertical
// rhythm, so the muscle memory of "third one down" survives the toggle.

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

export function SidebarNav({
  sections,
  collapsed = false,
}: {
  sections: NavSection[];
  collapsed?: boolean;
}) {
  const pathname = usePathname();

  // Longest match wins, so /dashboard/research/projects lights Projects and
  // not Videos, whose href is a prefix of it.
  const activeHref = sections
    .flatMap((section) => section.items)
    .filter((item) => isActive(pathname, item.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  // min-h-0 is what lets this column scroll instead of pushing the sidebar
  // footer — email, plan, Sign out — off the bottom.
  return (
    <nav
      // No `items-center` on the column itself: it would size every row to its
      // content and let the 32px tiles spill out of a rail narrower than they
      // are. The rows centre themselves instead.
      //
      // The column still scrolls when the nav is taller than the screen, but
      // without a visible scrollbar: a grey bar running down the middle of a
      // floating panel reads as a seam in the panel rather than as a control.
      className="flex min-h-0 w-full flex-1 flex-col gap-3 overflow-y-auto px-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {sections.map((section) => (
        <div key={section.title} className="w-full">
          {collapsed ? (
            // A hairline instead of a heading: the groups still read as groups
            // without a word that has nowhere to fit.
            <div className="mx-auto mb-2 h-px w-6 bg-line first:hidden" />
          ) : (
            <p className="px-3 text-[9.5px] font-bold tracking-[0.12em] text-faint uppercase">
              {section.title}
            </p>
          )}
          <ul className={cx("flex w-full flex-col gap-0.5", collapsed ? "items-center" : "mt-1.5")}>
            {section.items.map((item) => {
              const active = item.href === activeHref;
              return (
                <li key={item.href} className="w-full">
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? item.label : undefined}
                    className={cx(
                      "flex items-center gap-2.5 rounded-[14px] transition",
                      collapsed ? "w-full justify-center p-1.5" : "px-2 py-1.5",
                      active
                        ? "bg-ink text-panel"
                        : "text-muted hover:bg-chip hover:text-ink",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cx(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-[11px] text-[13px] transition",
                        active
                          ? "bg-panel/15 text-panel"
                          : "border border-line text-muted",
                      )}
                    >
                      {item.icon}
                    </span>
                    {collapsed ? (
                      <span className="sr-only">{item.label}</span>
                    ) : (
                      <>
                        <span className="flex-1 truncate text-[13.5px] font-semibold">
                          {item.label}
                        </span>
                        {item.locked ? (
                          <span className="pr-1.5 text-[10px]" title="Not on your plan">
                            💎
                          </span>
                        ) : item.badge ? (
                          <span
                            className={cx(
                              "mr-1.5 rounded-full px-[7px] py-px text-[10px] font-semibold",
                              active ? "bg-panel/20 text-panel" : "bg-chip text-muted",
                            )}
                          >
                            {item.badge > 99 ? "99+" : item.badge}
                          </span>
                        ) : null}
                      </>
                    )}
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
