"use client";

import Link from "next/link";

import { Icon, PlanDiamond, type IconName } from "@/components/icons";
import { cx } from "@/components/ui";

// One row of the contextual rail: 18px icon, 14px/600 label, and a hover
// label (`title`) that says what the row does in plain words — a required
// part of the redesign, not polish. Active = ink on panel; a plan-locked row
// still renders, wearing the diamond, and explains the upgrade on press.

export function NavRow({
  href,
  label,
  icon,
  tip,
  active,
  badge,
  locked,
}: {
  href: string;
  label: string;
  icon: IconName;
  tip?: string;
  active: boolean;
  badge?: number;
  locked?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      title={tip ?? label}
      className={cx(
        "flex w-full items-center gap-[11px] rounded-lg px-2.5 py-2 transition-[background-color,color] duration-110",
        active ? "bg-ink text-panel" : "text-muted hover:bg-chip hover:text-ink",
      )}
    >
      <Icon
        name={icon}
        className={cx("h-[18px] w-[18px] shrink-0", active ? "" : "opacity-75")}
      />
      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">
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
    </Link>
  );
}
