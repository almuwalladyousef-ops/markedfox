"use client";

import { Busy, buttonClass } from "@/components/ui";
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
      className="flex flex-col gap-3 rounded-lg border border-line bg-panel p-5"
    >
      <h2 className="text-[14.5px] font-semibold">New project</h2>
      <input
        name="name"
        required
        placeholder="Q4 launch series"
        className="rounded-lg border border-line bg-chip px-3 py-2 text-[14.5px] outline-none transition-colors focus:border-line-strong"
      />
      <input
        name="description"
        placeholder="What this project is for (optional)"
        className="rounded-lg border border-line bg-chip px-3 py-2 text-[14.5px] outline-none transition-colors focus:border-line-strong"
      />
      <button
        type="submit"
        disabled={pending}
        className={buttonClass("primary", "md", "self-start")}
      >
        <Busy busy={pending}>
          {pending ? "Creating…" : "Create project"}
        </Busy>
      </button>
      {state.message ? (
        <p className={`text-[13px] ${state.ok ? "text-ok" : "text-danger"}`}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
