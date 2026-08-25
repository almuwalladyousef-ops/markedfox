"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { Icon, PlanDiamond } from "@/components/icons";
import { Busy, cx } from "@/components/ui";
import {
  createWorkspaceAction,
  switchWorkspaceAction,
  type WorkspaceFormState,
} from "@/lib/workspaces/actions";
import type { Workspace } from "@/lib/workspaces/store";

const INITIAL: WorkspaceFormState = {};

/**
 * Two letters standing in for the workspace name.
 *
 * Matching word characters rather than splitting on spaces is the whole
 * subtlety: "Client — Northwind" split on spaces gives ["Client", "—",
 * "Northwind"], whose first letters read "C—". Matching `[a-z0-9]+` skips the
 * punctuation and gives "CN".
 */
export function initialsOf(name: string): string {
  const [first, second] = name.match(/[a-z0-9]+/gi) ?? [];
  if (!first) return "?";
  if (!second) return first.slice(0, 2).toUpperCase();
  return (first[0] + second[0]).toUpperCase();
}

export function WorkspaceTile({
  name,
  size = 26,
  radius = 8,
  className,
}: {
  name: string;
  size?: number;
  radius?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, borderRadius: radius }}
      className={cx(
        "font-display inline-flex shrink-0 items-center justify-center bg-accent-soft text-[12px] font-bold text-accent",
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

export function WorkspaceSwitcher({
  workspaces,
  activeId,
  canCreate,
  createBlockedReason,
  remaining,
  /** `full` is the contextual rail: full width. `compact` is the mobile top
   *  bar: a small tile and a chevron, no name. */
  variant = "full",
}: {
  workspaces: Workspace[];
  activeId: string;
  canCreate: boolean;
  createBlockedReason?: string;
  /** Workspaces left on the plan; null on an unlimited plan. */
  remaining?: number | null;
  variant?: "full" | "compact";
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // Pressing anywhere else closes it, and so does Escape. Neither existed
  // before, which left re-pressing the trigger as the only way out of a menu
  // the user had already decided against — and the trigger is exactly where
  // the pointer is not, once they have looked away.
  //
  // `pointerdown` rather than `click`: the menu should be gone by the time the
  // press it was dismissed by has finished, not a beat afterwards. The
  // listener is only attached while the menu is open, so a closed switcher
  // costs nothing.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const [state, formAction, pending] = useActionState(
    createWorkspaceAction,
    INITIAL,
  );

  const active = workspaces.find((w) => w.id === activeId) ?? workspaces[0];
  const name = active?.name ?? "Workspace";

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={variant === "full" ? "Switch workspace" : `Workspace: ${name}`}
        className={cx(
          "flex items-center rounded-[13px] border border-line bg-panel text-ink transition-[border-color,box-shadow] duration-150 hover:border-line-strong hover:shadow-[0_1px_2px_rgba(24,24,27,.06)]",
          variant === "compact"
            ? "gap-1.5 px-2 py-1.5"
            : "w-full justify-between gap-2 px-2.5 py-2",
        )}
      >
        <span className="flex min-w-0 items-center gap-[9px]">
          <WorkspaceTile name={name} size={variant === "compact" ? 20 : 24} />
          {variant === "compact" ? null : (
            <span className="truncate text-[13px] font-bold">{name}</span>
          )}
        </span>
        <Icon
          name="chevronDown"
          className={cx(
            "h-[13px] w-[13px] text-faint transition-transform duration-150",
            open ? "rotate-180" : null,
          )}
        />
      </button>

      {open ? (
        <div
          // The menu grows out of the control it belongs to. A popover that
          // scales from its own centre looks like it arrived from somewhere
          // else, and `transform-origin: center` is the default, so this is a
          // thing you have to say rather than a thing you get.
          style={
            {
              // The compact trigger is a small tile at the right end of the
              // mobile bar and the menu hangs off it; the full one spans the
              // rail and the menu sits directly under it.
              "--mf-popover-origin":
                variant === "compact" ? "top right" : "top center",
            } as CSSProperties
          }
          className={cx(
            "mf-popover absolute z-40 mt-2 rounded-[14px] border border-line bg-panel p-1.5 shadow-[0_16px_40px_rgba(24,24,27,.12)]",
            variant === "compact" ? "right-0 w-56" : "right-0 left-0",
          )}
        >
          <ul className="flex flex-col">
            {workspaces.map((workspace) => (
              <li key={workspace.id}>
                <form action={switchWorkspaceAction}>
                  <input
                    type="hidden"
                    name="workspace_id"
                    value={workspace.id}
                  />
                  <button
                    type="submit"
                    title="Switch to this workspace"
                    className={cx(
                      "flex w-full items-center justify-between gap-2 rounded-[10px] px-2.5 py-2 text-left text-[13.5px] transition-[background] duration-150 hover:bg-chip",
                      workspace.id === activeId
                        ? "font-semibold text-ink"
                        : "text-muted",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <WorkspaceTile name={workspace.name} size={22} radius={7} />
                      <span className="truncate">{workspace.name}</span>
                    </span>
                    {workspace.id === activeId ? (
                      <Icon
                        name="check"
                        className="h-3.5 w-3.5 text-accent"
                        strokeWidth={2.4}
                      />
                    ) : null}
                  </button>
                </form>
              </li>
            ))}
          </ul>

          <div className="mt-1 border-t border-line pt-1">
            {creating ? (
              <form action={formAction} className="flex flex-col gap-2 p-1">
                <input
                  name="name"
                  placeholder="Workspace name"
                  autoFocus
                  required
                  maxLength={60}
                  className="rounded-[10px] border border-line bg-chip px-2.5 py-2 text-[13.5px] text-ink outline-none focus:border-accent"
                />
                {state.message ? (
                  <p
                    aria-live="polite"
                    className={cx(
                      "text-[12.5px]",
                      state.success ? "text-ok" : "text-danger",
                    )}
                  >
                    {state.message}
                  </p>
                ) : null}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={pending}
                    className="inline-flex items-center gap-1.5 rounded-[9px] bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-accent-ink transition-[filter,scale] duration-150 hover:brightness-[1.08] active:scale-[0.97] disabled:opacity-45 disabled:active:scale-100"
                  >
                    <Busy busy={pending}>{pending ? "Creating…" : "Create"}</Busy>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreating(false)}
                    className="rounded-[9px] border border-line px-3 py-1.5 text-[12.5px] font-semibold text-muted"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                title={
                  canCreate
                    ? remaining === null || remaining === undefined
                      ? "Create another workspace"
                      : `Create another workspace — ${remaining} left on your plan`
                    : createBlockedReason
                }
                className="flex w-full items-center justify-between gap-2 rounded-[10px] px-2.5 py-2 text-left text-[13.5px] font-semibold text-muted transition-[background,color] duration-150 hover:bg-chip hover:text-ink"
              >
                <span>+ New workspace</span>
                {/* Shown even when the plan is out — clicking explains why,
                    which is more use than a hidden or greyed-out row. */}
                <span className="flex items-center gap-1 rounded-full bg-accent-soft px-2 py-px text-[11px] font-bold text-accent">
                  {canCreate ? (
                    remaining === null || remaining === undefined ? (
                      "unlimited"
                    ) : (
                      `${remaining} left`
                    )
                  ) : (
                    <PlanDiamond className="h-2.5 w-2.5" />
                  )}
                </span>
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
