"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import {
  Button,
  Card,
  CardTitle,
  EmptyState,
  Kbd,
  MetricPills,

  Pill,
  inputClass,
} from "@/components/ui";
import {
  createScriptDraftAction,
  setIdeaNoteAction,
  setIdeaStatusAction,
  type StudioFormState,
} from "@/lib/research/studio-actions";
import type { IdeaWithVideo } from "@/lib/research/studio-types";

// The queue between research and writing.
//
// Triage is a rhythm: read, decide, next. So the list keeps selection in the
// URL-free client state, the arrows move it, and S/D/A act on it — because
// reaching for the mouse between every decision is what turns a thirty-idea
// inbox into an abandoned one.

const EMPTY: StudioFormState = {};

export function IdeaTriage({
  ideas,
  status,
}: {
  ideas: IdeaWithVideo[];
  status: "inbox" | "shortlisted";
}) {
  const [index, setIndex] = useState(0);
  const shortlistRef = useRef<HTMLButtonElement>(null);
  const discardRef = useRef<HTMLButtonElement>(null);
  const analysisRef = useRef<HTMLAnchorElement>(null);
  const scriptRef = useRef<HTMLButtonElement>(null);

  // The list shrinks as decisions are made, so a stale index would land on
  // nothing. Clamp rather than reset: staying near where they were is what a
  // person expects after acting on a row.
  const selected = ideas[Math.min(index, Math.max(ideas.length - 1, 0))];

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        (target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable))
      ) {
        return;
      }

      switch (event.key) {
        case "ArrowDown":
        case "j":
          setIndex((i) => Math.min(i + 1, ideas.length - 1));
          break;
        case "ArrowUp":
        case "k":
          setIndex((i) => Math.max(i - 1, 0));
          break;
        case "s":
        case "S":
          shortlistRef.current?.click();
          break;
        case "d":
        case "D":
          discardRef.current?.click();
          break;
        case "a":
        case "A":
          analysisRef.current?.click();
          break;
        case "c":
        case "C":
          scriptRef.current?.click();
          break;
        default:
          return;
      }
      event.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ideas.length]);

  if (ideas.length === 0) {
    return (
      <EmptyState
        title={status === "inbox" ? "Inbox empty" : "Nothing shortlisted yet"}
      >
        {status === "inbox"
          ? "Ideas land here every time a video is broken down — by hand, or by an auto-analyze rule while nobody is watching."
          : "Press Shortlist on an idea in the inbox and it appears here."}
      </EmptyState>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <ul className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto pr-1">
        {ideas.map((idea, position) => {
          const active = idea.id === selected?.id;
          return (
            <li key={idea.id}>
              <button
                type="button"
                onClick={() => setIndex(position)}
                className={`flex w-full gap-3 rounded-xl border p-2.5 text-left transition ${
                  active
                    ? "border-neutral-500 bg-neutral-900"
                    : "border-neutral-800 hover:border-neutral-700"
                }`}
              >
                <Thumb url={idea.video.thumbnail_url} />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm leading-snug font-medium">
                    {idea.title}
                  </span>
                  <span className="mt-1.5 block">
                    <MetricPills
                      score={
                        idea.video.outlier_score === null
                          ? null
                          : `${Number(idea.video.outlier_score).toFixed(1)}x`
                      }
                      views={idea.video.view_count}
                      engagement={
                        idea.video.engagement_rate === null
                          ? null
                          : Number(idea.video.engagement_rate)
                      }
                    />
                  </span>
                  <span className="mt-1 block truncate text-xs text-neutral-500">
                    {idea.video.source.handle
                      ? `@${idea.video.source.handle}`
                      : idea.video.source.title}
                    {idea.origin === "automation" ? " · auto" : ""}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {selected ? (
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <form action={setIdeaStatusAction}>
              <input type="hidden" name="idea_id" value={selected.id} />
              <input
                type="hidden"
                name="status"
                value={status === "inbox" ? "shortlisted" : "inbox"}
              />
              <button
                ref={shortlistRef}
                type="submit"
                className="flex items-center gap-2 rounded-lg border border-neutral-800 px-3 py-1.5 text-sm text-neutral-300 transition hover:border-neutral-600 hover:text-neutral-50"
              >
                {status === "inbox" ? "Shortlist" : "Back to inbox"}
                <Kbd>S</Kbd>
              </button>
            </form>

            <form action={setIdeaStatusAction}>
              <input type="hidden" name="idea_id" value={selected.id} />
              <input type="hidden" name="status" value="discarded" />
              <button
                ref={discardRef}
                type="submit"
                className="flex items-center gap-2 rounded-lg border border-neutral-800 px-3 py-1.5 text-sm text-neutral-300 transition hover:border-red-900 hover:text-red-300"
              >
                Discard
                <Kbd>D</Kbd>
              </button>
            </form>

            <Link
              ref={analysisRef}
              href={`/dashboard/research/${selected.video_id}`}
              className="flex items-center gap-2 rounded-lg border border-neutral-800 px-3 py-1.5 text-sm text-neutral-300 transition hover:border-neutral-600 hover:text-neutral-50"
            >
              Go to analysis
              <Kbd>A</Kbd>
            </Link>

            <form action={createScriptDraftAction} className="ml-auto">
              <input type="hidden" name="idea_id" value={selected.id} />
              <input type="hidden" name="video_id" value={selected.video_id} />
              <input type="hidden" name="topic" value={selected.title} />
              <button
                ref={scriptRef}
                type="submit"
                className="flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-black transition hover:bg-neutral-200"
              >
                Create script
                <Kbd>C</Kbd>
              </button>
            </form>
          </div>

          <Card>
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg leading-snug font-semibold">
                {selected.title}
              </h2>
              <a
                href={selected.video.url}
                target="_blank"
                rel="noreferrer noopener"
                className="shrink-0 text-xs text-neutral-500 underline hover:text-neutral-300"
              >
                Watch ↗
              </a>
            </div>
            {selected.summary ? (
              <p className="mt-3 text-sm leading-relaxed text-neutral-300">
                {selected.summary}
              </p>
            ) : (
              <p className="mt-3 text-sm text-neutral-500">
                No summary — this idea came from a video whose breakdown did not
                produce one.
              </p>
            )}
            <p className="mt-4 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
              <Pill>{selected.video.source.platform}</Pill>
              <span>
                from{" "}
                {selected.video.source.handle
                  ? `@${selected.video.source.handle}`
                  : selected.video.source.title}
              </span>
              <span className="text-neutral-700">·</span>
              <span className="truncate">{selected.video.title}</span>
            </p>
          </Card>

          <NoteCard ideaId={selected.id} note={selected.note} />
        </div>
      ) : null}
    </div>
  );
}

function NoteCard({ ideaId, note }: { ideaId: string; note: string | null }) {
  const [state, action, pending] = useActionState(setIdeaNoteAction, EMPTY);

  return (
    <Card>
      <CardTitle hint="The one field a model never writes.">Your notes</CardTitle>
      <form action={action} className="mt-3 flex flex-col gap-2">
        <input type="hidden" name="idea_id" value={ideaId} />
        <textarea
          name="note"
          rows={4}
          key={ideaId}
          defaultValue={note ?? ""}
          placeholder="Add your notes about this idea"
          className={`${inputClass} resize-y`}
        />
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save note"}
          </Button>
          {state.message ? (
            <span
              aria-live="polite"
              className={`text-xs ${state.ok ? "text-emerald-400" : "text-red-400"}`}
            >
              {state.message}
            </span>
          ) : null}
        </div>
      </form>
    </Card>
  );
}

function Thumb({ url }: { url: string | null }) {
  if (!url) {
    return <span className="block h-16 w-11 shrink-0 rounded-md bg-neutral-800" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      loading="lazy"
      className="h-16 w-11 shrink-0 rounded-md object-cover"
    />
  );
}

