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
}: {
  workspaces: Workspace[];
  activeId: string;
  canCreate: boolean;
  createBlockedReason?: string;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [state, formAction, pending] = useActionState(
    createWorkspaceAction,
    INITIAL,
  );

  const active = workspaces.find((w) => w.id === activeId) ?? workspaces[0];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-md border border-neutral-800 px-3 py-1.5 text-sm text-neutral-200 transition hover:border-neutral-600"
      >
        <span className="max-w-[12rem] truncate">{active?.name}</span>
        <span className="text-xs text-neutral-500">
          {workspaces.length > 1 ? `${workspaces.length} workspaces` : ""}
        </span>
        <span className="text-neutral-500">▾</span>
      </button>

      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-72 rounded-lg border border-neutral-800 bg-neutral-950 p-2 shadow-2xl">
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
                    className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition hover:bg-neutral-900 ${
                      workspace.id === activeId
                        ? "text-neutral-50"
                        : "text-neutral-400"
                    }`}
                  >
                    <span className="truncate">{workspace.name}</span>
                    {workspace.id === activeId ? <span>✓</span> : null}
                  </button>
                </form>
              </li>
            ))}
          </ul>

          <div className="mt-2 border-t border-neutral-900 pt-2">
            {creating ? (
              <form action={formAction} className="flex flex-col gap-2 px-1">
                <input
                  name="name"
                  placeholder="Workspace name"
                  autoFocus
                  required
                  maxLength={60}
                  className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm outline-none focus:border-neutral-500"
                />
                {state.message ? (
                  <p
                    aria-live="polite"
                    className={`text-xs ${state.success ? "text-emerald-400" : "text-red-400"}`}
                  >
                    {state.message}
                  </p>
                ) : null}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={pending}
                    className="rounded-md bg-neutral-50 px-2 py-1 text-xs font-semibold text-neutral-950 disabled:opacity-60"
                  >
                    {pending ? "Creating…" : "Create"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreating(false)}
                    className="rounded-md border border-neutral-800 px-2 py-1 text-xs text-neutral-400"
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
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-neutral-300 transition hover:bg-neutral-900"
              >
                <span>+ New workspace</span>
                {/* Shown even when the plan is out — clicking explains why,
                    which is more use than a hidden or greyed-out row. */}
                {!canCreate ? (
                  <span className="ml-auto rounded-full border border-amber-800/60 bg-amber-950/40 px-1.5 py-0.5 text-[10px] text-amber-300">
                    💎
                  </span>
                ) : null}
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
