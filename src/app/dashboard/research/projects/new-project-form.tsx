"use client";

import { useActionState } from "react";

import {
  createProjectAction,
  type ResearchFormState,
} from "@/lib/research/actions";

const EMPTY: ResearchFormState = {};

export function NewProjectForm() {
  const [state, action, pending] = useActionState(createProjectAction, EMPTY);

  return (
    <form
      action={action}
      className="flex flex-col gap-3 rounded-xl border border-neutral-800 bg-neutral-950/60 p-5"
    >
      <h2 className="text-sm font-semibold">New project</h2>
      <input
        name="name"
        required
        placeholder="Q4 launch series"
        className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm outline-none transition focus:border-neutral-600"
      />
      <input
        name="description"
        placeholder="What this project is for (optional)"
        className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm outline-none transition focus:border-neutral-600"
      />
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-neutral-200 disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create project"}
      </button>
      {state.message ? (
        <p className={`text-xs ${state.ok ? "text-emerald-400" : "text-red-400"}`}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
