"use client";

import { useActionState } from "react";

import { Busy, Notice, buttonClass } from "@/components/ui";
import { analyzeVideoAction, type ResearchFormState } from "@/lib/research/actions";

const EMPTY: ResearchFormState = {};

/**
 * The only control on an unanalysed video.
 *
 * It replaces two: "Fetch transcript" (free, optional) and "Break it down"
 * (one credit). Splitting them looked like giving the user control and was
 * really a trap — the breakdown runs happily with no transcript, working from
 * the title alone, and the script it then writes is invented rather than
 * derived. Nobody presses an optional button, and nothing on screen showed
 * what skipping it had cost.
 */
export function AnalyzeButton({
  videoId,
  enabled,
  creditsLeft,
  transcriptNote,
}: {
  videoId: string;
  /** False when this deployment cannot reach a model at all. */
  enabled: boolean;
  creditsLeft: number;
  /** What will happen about the words, said before the press rather than
   *  discovered after it. Null when the platform serves them normally. */
  transcriptNote: string | null;
}) {
  const [state, action, pending] = useActionState(analyzeVideoAction, EMPTY);
  const out = creditsLeft <= 0;

  return (
    <div className="flex flex-col items-center gap-3">
      <form action={action} className="w-full max-w-[420px]">
        <input type="hidden" name="video_id" value={videoId} />
        <button
          type="submit"
          disabled={!enabled || pending || out}
          className={buttonClass("primary", "lg", "w-full justify-center")}
        >
          <Busy busy={pending}>
            {pending ? "Analysing…" : "Analyse this video"}
          </Busy>
        </button>
      </form>

      <p className="text-center text-[13px] text-faint">
        {pending
          ? "Pulling the words, then working out why it landed. This takes a few seconds."
          : "Pulls the transcript, then breaks down why it worked. One credit."}
      </p>

      {transcriptNote ? (
        <p className="max-w-[420px] text-center text-[13px] text-muted">
          {transcriptNote}
        </p>
      ) : null}

      {out ? (
        <Notice tone="warn">No research credits left this month.</Notice>
      ) : null}
      {!enabled ? (
        <Notice tone="neutral">
          Analysis is not available yet. Channel tracking and outlier scoring
          already work.
        </Notice>
      ) : null}
      {state.message && !state.ok ? (
        <Notice tone="danger">{state.message}</Notice>
      ) : null}
    </div>
  );
}
