"use client";

import { useActionState } from "react";

import {
  breakdownVideoAction,
  type ResearchFormState,
} from "@/lib/research/actions";
import {
  HOOK_TYPE_LABELS,
  type Breakdown,
  type HookType,
} from "@/lib/research/breakdown";

const EMPTY: ResearchFormState = {};

/**
 * Step 3, and the reason the rest is worth anything.
 *
 * Presented before the generator on the page, in the order the engine actually
 * runs: find the outlier, understand WHY it worked, then write from that. A
 * generator sitting above an empty breakdown would invite the user to skip the
 * step that makes the output different from a plain prompt.
 */
export function BreakdownPanel({
  videoId,
  breakdown,
  enabled,
  creditsLeft,
  hasTranscript,
}: {
  videoId: string;
  breakdown: Breakdown | null;
  enabled: boolean;
  creditsLeft: number;
  hasTranscript: boolean;
}) {
  const [state, action, pending] = useActionState(breakdownVideoAction, EMPTY);

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">Why it worked</h2>
          <p className="mt-1 text-xs text-neutral-500">
            {breakdown
              ? "The mechanism behind this video. Scripts written from here reuse the structure, not the wording."
              : "Break the video down into its hook, its open loop, and its beats — then write from that instead of from the title."}
          </p>
        </div>
        {breakdown ? null : (
          <form action={action}>
            <input type="hidden" name="video_id" value={videoId} />
            <button
              type="submit"
              disabled={!enabled || pending || creditsLeft <= 0}
              className="shrink-0 rounded-lg bg-white px-3 py-2 text-xs font-medium text-black transition hover:bg-neutral-200 disabled:opacity-50"
            >
              {pending ? "Analysing…" : "Break it down"}
            </button>
          </form>
        )}
      </div>

      {/* Only worth saying when there is no breakdown yet and no button to
          press. Beside a finished breakdown it explains nothing. */}
      {!enabled && !breakdown ? (
        <p className="mt-4 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 text-xs text-neutral-500">
          Breakdowns need an AI key on this deployment. Tracking and outlier
          scoring already work.
        </p>
      ) : null}

      {!breakdown && enabled && !hasTranscript ? (
        <p className="mt-4 text-xs text-amber-400/80">
          No transcript yet. Fetch one first (it is free) — without it the
          breakdown works from the title alone and will say so rather than guess.
        </p>
      ) : null}

      {state.message ? (
        <p className={`mt-3 text-xs ${state.ok ? "text-emerald-400" : "text-red-400"}`}>
          {state.message}
        </p>
      ) : null}

      {breakdown ? (
        <dl className="mt-4 flex flex-col gap-4 text-sm">
          {breakdown.hook ? (
            <Field label="Hook">
              <p className="italic text-neutral-200">&ldquo;{breakdown.hook}&rdquo;</p>
              {breakdown.hookType ? (
                <p className="mt-1 text-xs text-neutral-500">
                  {HOOK_TYPE_LABELS[breakdown.hookType as HookType]}
                </p>
              ) : null}
            </Field>
          ) : null}

          {breakdown.curiosityLoop ? (
            <Field label="What holds attention">
              <p className="text-neutral-300">{breakdown.curiosityLoop}</p>
            </Field>
          ) : null}

          {breakdown.structure.length > 0 ? (
            <Field label="Beats">
              <ol className="flex flex-col gap-1.5">
                {breakdown.structure.map((beat, index) => (
                  <li key={index} className="flex gap-3 text-neutral-300">
                    <span className="w-16 shrink-0 text-xs uppercase tracking-wide text-neutral-500">
                      {beat.label}
                    </span>
                    <span className="min-w-0">{beat.detail}</span>
                  </li>
                ))}
              </ol>
            </Field>
          ) : null}

          {breakdown.formatNotes ? (
            <Field label="Format">
              <p className="text-neutral-300">{breakdown.formatNotes}</p>
            </Field>
          ) : null}

          {breakdown.takeaway ? (
            <Field label="Copy this">
              <p className="rounded-lg border border-emerald-900/50 bg-emerald-950/20 px-3 py-2 text-emerald-100">
                {breakdown.takeaway}
              </p>
            </Field>
          ) : null}

          {breakdown.notes ? (
            <Field label="Notes">
              <p className="text-neutral-400">{breakdown.notes}</p>
            </Field>
          ) : null}
        </dl>
      ) : null}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </dt>
      <dd className="mt-1.5">{children}</dd>
    </div>
  );
}
