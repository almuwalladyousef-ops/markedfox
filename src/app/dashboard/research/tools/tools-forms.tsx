"use client";

import { useActionState } from "react";

import {
  auditChannelAction,
  generateHooksAction,
  transcribeLinkAction,
  type ResearchFormState,
} from "@/lib/research/actions";

const EMPTY: ResearchFormState = {};

/** The hook generator, standalone: no tracked channel required, just a topic. */
export function HookGeneratorForm({
  enabled,
  creditsLeft,
}: {
  enabled: boolean;
  creditsLeft: number;
}) {
  const [state, action, pending] = useActionState(generateHooksAction, EMPTY);

  return (
    <section className="rounded-xl border border-line bg-panel p-5">
      <h2 className="text-sm font-semibold">Hook generator</h2>
      <p className="mt-1 text-xs text-faint">
        Twenty openings for one topic, spread across the patterns that work —
        contradiction, open loop, stakes, a number, a direct question. One credit.
      </p>

      {!enabled ? (
        <p className="mt-4 rounded-lg border border-line bg-chip px-4 py-3 text-xs text-faint">
          Needs an AI key on this deployment.
        </p>
      ) : (
        <form action={action} className="mt-4 flex flex-col gap-3">
          <input
            name="topic"
            required
            placeholder="Why most home espresso tastes sour"
            className="rounded-lg border border-line bg-chip px-3 py-2 text-sm outline-none transition focus:border-line-strong"
          />
          <button
            type="submit"
            disabled={pending || creditsLeft <= 0}
            className="self-start rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition hover:brightness-[1.08] disabled:opacity-50"
          >
            {pending ? "Writing…" : "Write 20 hooks"}
          </button>
          {state.message ? (
            <p className={`text-xs ${state.ok ? "text-ok" : "text-danger"}`}>
              {state.message}
            </p>
          ) : null}
        </form>
      )}
    </section>
  );
}

/** Paste any YouTube link, get the transcript. Free — no model runs. */
export function TranscriptForm() {
  const [state, action, pending] = useActionState(transcribeLinkAction, EMPTY);

  return (
    <section className="rounded-xl border border-line bg-panel p-5">
      <h2 className="text-sm font-semibold">Transcript downloader</h2>
      <p className="mt-1 text-xs text-faint">
        Paste any YouTube link — including a Short — and get the captions.
        Free: no model runs, so no credit is spent. Instagram, TikTok, and X
        serve no captions through their APIs, so those links cannot be
        transcribed by anyone.
      </p>

      <form action={action} className="mt-4 flex flex-col gap-3">
        <input
          name="url"
          required
          placeholder="https://youtube.com/watch?v=… or /shorts/…"
          className="rounded-lg border border-line bg-chip px-3 py-2 text-sm outline-none transition focus:border-line-strong"
        />
        <button
          type="submit"
          disabled={pending}
          className="self-start rounded-lg border border-line-strong px-4 py-2 text-sm font-medium transition hover:bg-chip disabled:opacity-50"
        >
          {pending ? "Fetching…" : "Get transcript"}
        </button>
        {state.message ? (
          <p className={`text-xs ${state.ok ? "text-ok" : "text-danger"}`}>
            {state.message}
          </p>
        ) : null}
      </form>
    </section>
  );
}

/** Audit one of the user's own tracked channels against itself. */
export function AuditForm({
  sources,
  enabled,
  creditsLeft,
}: {
  sources: { id: string; title: string; platform: string }[];
  enabled: boolean;
  creditsLeft: number;
}) {
  const [state, action, pending] = useActionState(auditChannelAction, EMPTY);

  return (
    <section className="rounded-xl border border-line bg-panel p-5">
      <h2 className="text-sm font-semibold">Channel audit</h2>
      <p className="mt-1 text-xs text-faint">
        Judges a channel against its own history — what the winners have in
        common, what the flops do, and what to do more of. Track your own
        channel to audit yourself. One credit.
      </p>

      {sources.length === 0 ? (
        <p className="mt-4 rounded-lg border border-line bg-chip px-4 py-3 text-xs text-faint">
          Track a channel first — an audit needs its history, and tracking is
          what builds that.
        </p>
      ) : !enabled ? (
        <p className="mt-4 rounded-lg border border-line bg-chip px-4 py-3 text-xs text-faint">
          Needs an AI key on this deployment.
        </p>
      ) : (
        <form action={action} className="mt-4 flex flex-col gap-3">
          <select
            name="source_id"
            className="rounded-lg border border-line bg-chip px-3 py-2 text-sm outline-none"
          >
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.title} ({source.platform})
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={pending || creditsLeft <= 0}
            className="self-start rounded-lg border border-line-strong px-4 py-2 text-sm font-medium transition hover:bg-chip disabled:opacity-50"
          >
            {pending ? "Auditing…" : "Audit this channel"}
          </button>
          {state.message ? (
            <p className={`text-xs ${state.ok ? "text-ok" : "text-danger"}`}>
              {state.message}
            </p>
          ) : null}
        </form>
      )}
    </section>
  );
}
