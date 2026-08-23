"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon, PlanDiamond, type IconName } from "@/components/icons";
import { cx } from "@/components/ui";

// The nav. A client component only because the active item is decided by the
// current path, and highlighting the wrong row is worse than shipping a few
// kilobytes of JavaScript.
//
// Two widths. Expanded is an icon and a label on one row. Collapsed drops the
// label, keeps the same rows in the same order, and grows the icon from 18px
// to 25px — a 92px rail with an 18px glyph in the middle of it reads as an
// empty column, and the icon is the whole control once the word is gone. A
// count badge has nowhere to sit at that width, so it becomes a dot.

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  /** Shown as a count on the right, the way an inbox shows unread. */
  badge?: number;
  /** Outside the plan: still rendered, wearing the plan diamond. Never hidden. */
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

/** Shared by the nav rows and the Settings row in the sidebar footer, which
 *  is the same control in a different part of the panel. */
export function NavRow({
  href,
  label,
  icon,
  collapsed,
  active,
  badge,
  locked,
}: {
  href: string;
  label: string;
  icon: IconName;
  collapsed: boolean;
  active: boolean;
  badge?: number;
  locked?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? label : undefined}
      className={cx(
        "relative flex items-center gap-3 rounded-[13px] transition-[background,color] duration-150",
        collapsed ? "justify-center py-[11px]" : "px-3 py-2",
        active
          ? "bg-ink text-panel"
          : "text-muted hover:bg-chip hover:text-ink",
      )}
    >
      <Icon
        name={icon}
        className={cx(
          collapsed ? "h-[25px] w-[25px]" : "h-[18px] w-[18px]",
          active ? "" : "opacity-75",
        )}
      />
      {collapsed ? (
        <>
          <span className="sr-only">{label}</span>
          {/* At 92px there is no room for a number, but "there is something
              here" is most of what the number was saying. */}
          {badge ? (
            <span
              aria-hidden
              className="absolute top-1.5 right-2 h-[7px] w-[7px] rounded-full bg-accent"
            />
          ) : null}
        </>
      ) : (
        <>
          <span className="flex-1 truncate text-[14.5px] font-semibold">
            {label}
          </span>
          {locked ? (
            <PlanDiamond className="h-[11px] w-[11px]" />
          ) : badge ? (
            <span
              className={cx(
                "rounded-full px-2 py-px text-[11px] font-bold",
                active ? "bg-white/20 text-panel" : "bg-chip text-muted",
              )}
            >
              {badge > 99 ? "99+" : badge}
            </span>
          ) : null}
        </>
      )}
    </Link>
  );
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
  // footer — Settings and the user row — off the bottom. The scrollbar itself
  // is hidden: a grey bar running down the middle of a floating panel reads as
  // a seam in the panel rather than as a control.
  return (
    <nav className="flex min-h-0 w-full flex-1 flex-col gap-[9px] overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {sections.map((section) => (
        <div key={section.title} className="w-full">
          {collapsed ? (
            // A hairline instead of a heading: the groups still read as groups
            // without a word that has nowhere to fit.
            <div className="mx-auto mb-2 h-px w-6 bg-line first:hidden" />
          ) : (
            <p className="mb-1.5 px-3 text-[10.5px] font-bold tracking-[0.11em] text-faint uppercase">
              {section.title}
            </p>
          )}
          <ul className="flex w-full flex-col gap-0.5">
            {section.items.map((item) => (
              <li key={item.href}>
                <NavRow
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  collapsed={collapsed}
                  active={item.href === activeHref}
                  badge={item.badge}
                  locked={item.locked}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
