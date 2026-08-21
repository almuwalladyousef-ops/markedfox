"use client";

import { useActionState, useState } from "react";

import {
  createWorkspaceAction,
  switchWorkspaceAction,
  type WorkspaceFormState,
} from "@/lib/workspaces/actions";
import type { Workspace } from "@/lib/workspaces/store";

const INITIAL: WorkspaceFormState = {};

export function WorkspaceSwitcher({
  workspaces,
  activeId,
  canCreate,
  createBlockedReason,
  remaining,
}: {
  workspaces: Workspace[];
  activeId: string;
  canCreate: boolean;
  createBlockedReason?: string;
  /** Workspaces left on the plan; null on an unlimited plan. */
  remaining?: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [state, formAction, pending] = useActionState(
    createWorkspaceAction,
    INITIAL,
  );

  const active = workspaces.find((w) => w.id === activeId) ?? workspaces[0];

  return (
    <div className="relative px-0.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-[10px] border border-line bg-chip px-3 py-2 text-[12.5px] font-medium text-ink transition hover:border-line-strong"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-accent" />
          <span className="truncate">{active?.name}</span>
        </span>
        <span className="text-[10px] text-faint">▾</span>
      </button>

      {open ? (
        <div className="absolute right-0.5 left-0.5 z-40 mt-1.5 rounded-xl border border-line bg-panel p-1.5 shadow-panel">
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
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[13px] transition hover:bg-chip ${
                      workspace.id === activeId ? "text-ink" : "text-muted"
                    }`}
                  >
                    <span className="truncate">{workspace.name}</span>
                    {workspace.id === activeId ? (
                      <span className="text-accent">✓</span>
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
                  className="rounded-lg border border-line bg-chip px-2 py-1.5 text-[13px] text-ink outline-none focus:border-accent"
                />
                {state.message ? (
                  <p
                    aria-live="polite"
                    className={`text-[11.5px] ${state.success ? "text-ok" : "text-danger"}`}
                  >
                    {state.message}
                  </p>
                ) : null}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={pending}
                    className="rounded-lg bg-accent px-2.5 py-1 text-[11.5px] font-semibold text-accent-ink disabled:opacity-45"
                  >
                    {pending ? "Creating…" : "Create"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreating(false)}
                    className="rounded-lg border border-line px-2.5 py-1 text-[11.5px] text-muted"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                title={canCreate ? undefined : createBlockedReason}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-muted transition hover:bg-chip"
              >
                <span>+ New workspace</span>
                {/* Shown even when the plan is out — clicking explains why,
                    which is more use than a hidden or greyed-out row. */}
                <span className="rounded-full bg-accent-soft px-[7px] py-px text-[10px] font-semibold text-accent">
                  {canCreate
                    ? remaining === null || remaining === undefined
                      ? "unlimited"
                      : `${remaining} left`
                    : "💎"}
                </span>
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
