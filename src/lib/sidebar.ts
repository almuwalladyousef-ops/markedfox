export type SidebarState = "open" | "collapsed";

/** Read on the server so the first paint already has the width the person
 *  chose — a sidebar that expands a moment after load is worse than one that
 *  never collapsed. Written by the client beside the state it renders from. */
export const SIDEBAR_COOKIE = "mf-sidebar";

export const DEFAULT_SIDEBAR: SidebarState = "open";

export function normalizeSidebar(
  value: string | undefined | null,
): SidebarState {
  return value === "collapsed" ? "collapsed" : DEFAULT_SIDEBAR;
}
