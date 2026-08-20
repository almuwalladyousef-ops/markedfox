"use client";

import { useActionState } from "react";

import {
  generateScriptAction,
  type ResearchFormState,
} from "@/lib/research/actions";

const EMPTY: ResearchFormState = {};

const KINDS = [
  { id: "hooks", label: "10 hooks", hint: "Ten alternative openings" },
  { id: "outline", label: "Outline", hint: "Beat by beat" },
  { id: "script", label: "Full script", hint: "45–75 seconds" },
] as const;

/**
 * One generation = one credit, and the credit is only spent if the model
 * actually answers — every failure message says so, because a user who thinks
 * a failed click cost them a credit stops clicking.
 */
export function GeneratePanel({
  videoId,
  enabled,
  creditsLeft,
}: {
  videoId: string;
  enabled: boolean;
  creditsLeft: number;
}) {
  const [state, action, pending] = useActionState(generateScriptAction, EMPTY);
  const out = creditsLeft <= 0;

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-5">
      <h2 className="text-sm font-semibold">Write from this video</h2>
      <p className="mt-1 text-xs text-neutral-500">
        Uses the transcript when there is one, plus the title and how far it beat
        its channel. Each generation spends one credit — {Math.max(0, creditsLeft)}{" "}
        left this month.
      </p>

      {!enabled ? (
        <p className="mt-4 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 text-xs text-neutral-500">
          Generation turns on once an AI key is configured on this deployment.
          Channel tracking and outlier scoring already work.
        </p>
      ) : (
        <form action={action} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="video_id" value={videoId} />

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-neutral-400">
              Your angle (optional)
            </span>
            <input
              name="topic"
              placeholder="Same structure, but about home espresso"
              className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm outline-none transition focus:border-neutral-600"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            {KINDS.map((kind) => (
              <button
                key={kind.id}
                type="submit"
                name="kind"
                value={kind.id}
                disabled={pending || out}
                title={kind.hint}
                className="rounded-lg border border-neutral-700 px-3 py-2 text-xs font-medium transition hover:bg-neutral-900 disabled:opacity-50"
              >
                {kind.label}
              </button>
            ))}
          </div>

          {out ? (
            <p className="text-xs text-amber-400">
              No research credits left this month.
            </p>
          ) : null}
          {pending ? (
            <p className="text-xs text-neutral-500">Writing…</p>
          ) : null}
          {state.message ? (
            <p
              className={`text-xs ${state.ok ? "text-emerald-400" : "text-red-400"}`}
            >
              {state.message}
            </p>
          ) : null}
        </form>
      )}
    </section>
  );
}
