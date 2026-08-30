import type { IconName } from "@/components/icons";
import type { ShellSpaceId } from "@/lib/shell";

// The shape the server layout hands the client shell: the static space map
// from lib/shell decorated with what only the server knows — plan locks, the
// idea-inbox badge, and each space's usage meter.

export type DecoratedRow =
  | { heading: string }
  | {
      href: string;
      label: string;
      icon: IconName;
      tip: string;
      badge?: number;
      /** Outside the plan: still rendered, wearing the plan diamond. */
      locked?: boolean;
    };

export function isDecoratedItem(
  row: DecoratedRow,
): row is Exclude<DecoratedRow, { heading: string }> {
  return "href" in row;
}

export type SpaceMeter = {
  title: string;
  note: string;
  /** 0–100, or null for "no bar" — an unlimited figure never draws one. */
  pct: number | null;
};

export type DecoratedSpace = {
  id: ShellSpaceId;
  label: string;
  icon: IconName;
  tip: string;
  title: string;
  sub: string;
  firstHref: string;
  rows: DecoratedRow[];
  /** Only the research space carries one — owner decision 2026-08-30: a
   *  meter beside work somebody does all day reads as a countdown. Credits
   *  are the exception, because they are the one allowance that is really
   *  spent per action. */
  meter: SpaceMeter | null;
};
