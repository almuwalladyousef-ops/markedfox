"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import { Icon } from "@/components/icons";
import { Busy, Button, buttonClass, Card, CardTitle, cx, EmptyState, Eyebrow, inputClass, Kbd, MetricPills, Pill, StickyPane, TwoPane } from "@/components/ui";
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

/** Label/text pairs per section, or null where the model said nothing. */
export type IdeaAnalysis = {
  positioning: [string, string | null][];
  format: [string, string | null][];
  contrast: [string, string | null][];
  hook: [string, string | null][];
};

export function IdeaTriage({
  ideas,
  status,
  analyses,
}: {
  ideas: IdeaWithVideo[];
  status: "inbox" | "shortlisted";
  /** Keyed by video id; absent for a video that has not been broken down. */
  analyses: Record<string, IdeaAnalysis>;
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
    // A wrapping flex row with a floor on each pane, not a grid: at around
    // 920px a `330px 1fr` grid let the detail column shrink under its own
    // minimum and spill its title sideways.
    <TwoPane>
      {/* The bases are what decide whether this wraps, not the floors: a
          wrapping flex row breaks the line on base sizes and only then
          shrinks. 360 + 480 + the gap clears the ~920px a 1280px window
          leaves beside the rail, so the two panes hold at a laptop width and
          still stack honestly below it. */}
      <StickyPane className="min-w-[340px] flex-[0_1_360px]">
      <ul className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto pr-1">
        {ideas.map((idea, position) => {
          const active = idea.id === selected?.id;
          return (
            <li key={idea.id}>
              <button
                type="button"
                onClick={() => setIndex(position)}
                className={cx(
                  "flex w-full gap-3 rounded-lg border p-3 text-left transition-[background-color,border-color] duration-110",
                  active
                    ? "border-accent bg-accent-soft"
                    : "border-line bg-panel hover:border-line-strong",
                )}
              >
                <Thumb url={idea.video.thumbnail_url} />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-[14px]/[20px] font-semibold text-ink">
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
                  <span className="mt-1.5 block truncate text-[12.5px] text-faint">
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
      </StickyPane>

      {selected ? (
        <div className="flex min-w-[min(100%,440px)] flex-[1_1_480px] flex-col gap-4">
          {/* The keys are documented where they are used, not in a help page
              nobody opens. */}
          <p className="flex flex-wrap items-center gap-2 text-[12.5px] text-faint">
            <Kbd>Esc</Kbd>
            <span>clears focus</span>
            <span aria-hidden>·</span>
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            <span>move through the queue</span>
          </p>
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
                className={ACTION_BUTTON}
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
                className="flex items-center gap-2 rounded-md border border-line px-3.5 py-2 text-[13px] font-semibold text-muted transition-[border-color,color] duration-110 hover:border-danger hover:text-danger"
              >
                Discard
                <Kbd>D</Kbd>
              </button>
            </form>

            <Link
              ref={analysisRef}
              href={`/dashboard/research/${selected.video_id}`}
              className={ACTION_BUTTON}
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
                className={buttonClass("primary", "sm")}
              >
                Create script
                <Kbd className="border-accent-ink/40 bg-transparent text-accent-ink">
                  C
                </Kbd>
              </button>
            </form>
          </div>

          <Card>
            <div className="flex flex-wrap items-start gap-5">
              <div className="min-w-[240px] flex-1">
                <h2 className="font-display text-[22px]/[30px] font-bold tracking-[-0.02em] text-ink">
                  {selected.title}
                </h2>
                {selected.summary ? (
                  <p className="mt-3 text-[14.5px]/[22px] text-pretty text-muted">
                    {selected.summary}
                  </p>
                ) : (
                  <p className="mt-3 text-[14px] text-faint">
                    No summary — this idea came from a video whose breakdown did
                    not produce one.
                  </p>
                )}
                <p className="mt-4 flex flex-wrap items-center gap-2 text-[13px] text-faint">
                  <Pill>{selected.video.source.platform}</Pill>
                  <span>
                    from{" "}
                    {selected.video.source.handle
                      ? `@${selected.video.source.handle}`
                      : selected.video.source.title}
                  </span>
                  <span aria-hidden>·</span>
                  <span className="truncate">{selected.video.title}</span>
                </p>
              </div>
              <a
                href={selected.video.url}
                target="_blank"
                rel="noreferrer noopener"
                title="Watch the original"
                className="group relative block w-[180px] shrink-0 overflow-hidden rounded-lg bg-chip"
              >
                {selected.video.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selected.video.thumbnail_url}
                    alt=""
                    className="aspect-[9/16] w-full object-cover"
                  />
                ) : (
                  <span className="block aspect-[9/16] w-full" />
                )}
                <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-gradient-to-t from-black/80 to-transparent py-2.5 text-[12.5px] font-semibold text-white">
                  <Icon name="external" className="h-3.5 w-3.5" />
                  Watch
                </span>
              </a>
            </div>
          </Card>

          {/* Keyed by the idea: the save confirmation lives in this
              component's own state, and without a key it would still read
              "Saved." after arrowing to the next idea, about a note that one
              does not have. */}
          <NoteCard key={selected.id} ideaId={selected.id} note={selected.note} />

          {/* Why the original worked, in the same four sections everywhere it
              appears. Absent rather than empty when the video has no
              breakdown — a screenful of headings over nothing reads as a
              failure, not as "not analyzed yet". */}
          {analyses[selected.video_id] ? (
            <Card>
              <CardTitle hint="from the breakdown of the original">
                Why it worked
              </CardTitle>
              <div className="mt-5 flex flex-col gap-6">
                <AnalysisBlock
                  title="Content positioning"
                  rows={analyses[selected.video_id].positioning}
                />
                <AnalysisBlock
                  title="Storytelling format"
                  rows={analyses[selected.video_id].format}
                />
                <AnalysisBlock
                  title="Contrast mechanism"
                  rows={analyses[selected.video_id].contrast}
                />
                <AnalysisBlock
                  title="Hook alignment"
                  rows={analyses[selected.video_id].hook}
                />
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}
    </TwoPane>
  );
}

const ACTION_BUTTON =
  "flex items-center gap-2 rounded-md border border-line px-3.5 py-2 text-[13px] font-semibold text-muted transition-[border-color,color] duration-110 hover:border-line-strong hover:text-ink";

function AnalysisBlock({
  title,
  rows,
}: {
  title: string;
  rows: [string, string | null][];
}) {
  const filled = rows.filter(([, value]) => value);
  if (filled.length === 0) return null;
  return (
    <section className="border-l-2 border-line pl-4">
      <h3 className="font-display text-[15.5px] font-bold tracking-[-0.01em] text-ink">
        {title}
      </h3>
      <dl className="mt-3 flex flex-col gap-3">
        {filled.map(([label, value]) => (
          <div key={label}>
            <Eyebrow>{label}</Eyebrow>
            <dd className="mt-1 text-[14.5px]/[22px] text-pretty text-muted">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function NoteCard({ ideaId, note }: { ideaId: string; note: string | null }) {
  const [state, action, pending] = useActionState(setIdeaNoteAction, EMPTY);

  return (
    <Card>
      <CardTitle hint="the one field a model never writes">Your notes</CardTitle>
      <form action={action} className="mt-3 flex flex-col gap-2">
        <input type="hidden" name="idea_id" value={ideaId} />
        <textarea
          name="note"
          rows={3}
          key={ideaId}
          defaultValue={note ?? ""}
          placeholder="Add your notes about this idea"
          className={cx(inputClass, "resize-y")}
        />
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={pending}>
            <Busy busy={pending}>
              {pending ? "Saving…" : "Save note"}
            </Busy>
          </Button>
          {state.message ? (
            <span
              aria-live="polite"
              className={cx("text-[13px]", state.ok ? "text-ok" : "text-danger")}
            >
              {state.message}
            </span>
          ) : null}
        </div>
      </form>
    </Card>
  );
}

/** 9:16, because every video in this queue is. The old landscape crop cut the
 *  top and bottom off every thumbnail in the list. */
function Thumb({ url }: { url: string | null }) {
  if (!url) {
    return <span className="block h-[60px] w-[34px] shrink-0 rounded-lg bg-chip" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      loading="lazy"
      className="h-[60px] w-[34px] shrink-0 rounded-lg object-cover"
    />
  );
}

