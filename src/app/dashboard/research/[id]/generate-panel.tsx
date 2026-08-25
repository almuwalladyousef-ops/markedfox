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
  hasBreakdown,
}: {
  videoId: string;
  enabled: boolean;
  creditsLeft: number;
  /** With a breakdown the model gets the mechanism and never the original
   *  words, so the result is a remix by construction. Without one it works
   *  from the raw video and will echo its phrasing — said plainly, because a
   *  user who does not know that will blame the output. */
  hasBreakdown: boolean;
}) {
  const [state, action, pending] = useActionState(generateScriptAction, EMPTY);
  const out = creditsLeft <= 0;

  return (
    <section className="rounded-xl border border-line bg-panel p-5">
      <h2 className="text-[14.5px] font-semibold">Write from this video</h2>
      <p className="mt-1 text-[13px] text-faint">
        {hasBreakdown
          ? "Works from the breakdown above — the structure carries over, the wording cannot, because the model never sees it."
          : "No breakdown yet, so this works from the raw video and may echo its phrasing. Break it down first for a genuine remix."}{" "}
        Each generation spends one credit — {Math.max(0, creditsLeft)} left this
        month.
      </p>

      {!enabled ? (
        <p className="mt-4 rounded-lg border border-line bg-chip px-4 py-3 text-[13px] text-faint">
          Generation turns on once an AI key is configured on this deployment.
          Channel tracking and outlier scoring already work.
        </p>
      ) : (
        <form action={action} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="video_id" value={videoId} />

          <label className="flex flex-col gap-1 text-[14.5px]">
            <span className="text-[13px] font-medium text-muted">
              Your angle (optional)
            </span>
            <input
              name="topic"
              placeholder="Same structure, but about home espresso"
              className="rounded-lg border border-line bg-chip px-3 py-2 text-[14.5px] outline-none transition-colors focus:border-line-strong"
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
                className="rounded-lg border border-line-strong px-3 py-2 text-[13px] font-medium transition-[color,background-color,border-color,opacity] hover:bg-chip disabled:opacity-50"
              >
                {kind.label}
              </button>
            ))}
          </div>

          {out ? (
            <p className="text-[13px] text-warn">
              No research credits left this month.
            </p>
          ) : null}
          {pending ? (
            <p className="text-[13px] text-faint">Writing…</p>
          ) : null}
          {state.message ? (
            <p
              className={`text-[13px] ${state.ok ? "text-ok" : "text-danger"}`}
            >
              {state.message}
            </p>
          ) : null}
        </form>
      )}
    </section>
  );
}
