"use client";

import Link from "next/link";

import { AvatarImage } from "@/components/avatar-image";
import { usePathname } from "next/navigation";

import { Icon, type IconName } from "@/components/icons";
import { cx } from "@/components/ui";
import { signOut } from "@/lib/auth/actions";

// The settings menu: five groups, one active row, and the door out at the
// foot.
//
// Each group is ONE bordered list divided by hairlines, not a stack of
// individually bordered rows. Thirteen rows meant thirteen outlines plus the
// menu's own column plus the page panel, and a border drawn around something
// that is already obviously a group is a border doing nothing. The active row
// is now marked by fill and a rule on its leading edge, which reads at a
// glance where a swapped border colour did not.
//
// It is grouped by whose problem it solves rather than by which table it
// writes to — "my setup" is the product, "manage my account" is the login,
// "help and support" is us, and the last group is everything a person only
// visits when something has gone wrong or is ending. That ordering is the
// reason the list can be this long without being a wall.

export type MenuRow = {
  href: string;
  icon: IconName;
  label: string;
  detail?: string;
  trail?: string;
  trailAccent?: boolean;
};

export type MenuGroup = { title: string; rows: MenuRow[] };

export function SettingsMenu({
  groups,
  name,
  email,
  avatarUrl,
}: {
  groups: MenuGroup[];
  name: string;
  email: string;
  avatarUrl: string | null;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-6">
      <div className="rounded-2xl border border-line bg-panel p-5">
        <div className="flex items-center gap-3.5">
          <AvatarImage
            src={avatarUrl}
            className="h-11 w-11 shrink-0 rounded-full object-cover"
            fallback={
              <span
                aria-hidden
                className="font-display flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-[17px] font-bold text-panel uppercase"
              >
                {name.trim().charAt(0) || "?"}
              </span>
            }
          />
          <div className="min-w-0">
            <p className="font-display truncate text-[17px] font-bold tracking-[-0.01em] text-ink">
              {name}
            </p>
            <p className="truncate text-[13px] text-muted" title={email}>
              {email}
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/settings/workspaces"
          className="mt-4 flex items-center gap-2.5 rounded-lg border border-line px-3.5 py-2.5 text-[14px] font-semibold text-ink transition-[border-color] duration-110 hover:border-line-strong"
        >
          <Icon name="people" className="h-[18px] w-[18px] text-muted" />
          Manage workspaces
          <Icon name="chevronRight" className="ml-auto h-3.5 w-3.5 text-faint" />
        </Link>
      </div>

      {groups.map((group) => (
        <div key={group.title}>
          <h2 className="font-display px-1 text-[14px] font-bold text-ink">
            {group.title}
          </h2>
          <ul className="mt-2.5 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
            {group.rows.map((row) => {
              const active = pathname === row.href;
              return (
                <li key={row.href}>
                  <Link
                    href={row.href}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "flex items-center gap-3 border-l-2 px-4 py-3 transition-[background-color,border-color] duration-110",
                      active
                        ? "border-accent bg-chip"
                        : "border-transparent hover:bg-chip",
                    )}
                  >
                    <Icon
                      name={row.icon}
                      className="h-[18px] w-[18px] text-muted"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-semibold text-ink">
                        {row.label}
                      </span>
                      {row.detail ? (
                        <span className="block truncate text-[13px] text-faint">
                          {row.detail}
                        </span>
                      ) : null}
                    </span>
                    {row.trail ? (
                      <span
                        className={cx(
                          "shrink-0 rounded-full px-2.5 py-0.5 text-[11.5px] font-bold capitalize",
                          row.trailAccent
                            ? "bg-accent-soft text-accent"
                            : "bg-chip text-muted",
                        )}
                      >
                        {row.trail}
                      </span>
                    ) : null}
                    <Icon
                      name="chevronRight"
                      className="h-3.5 w-3.5 shrink-0 text-faint"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <form action={signOut}>
        <button
          type="submit"
          className="flex w-full items-center gap-3 rounded-2xl border border-line px-4 py-3 text-[14.5px] font-semibold text-danger transition-[background-color,border-color] duration-110 hover:border-danger hover:bg-danger-soft"
        >
          <Icon name="logout" className="h-[18px] w-[18px]" />
          Log out
        </button>
      </form>
    </nav>
  );
}
