"use client";

import { useState } from "react";

import { Icon, type IconName } from "@/components/icons";
import { Pill } from "@/components/ui";
import { HOOK_TYPE_LABELS, type Breakdown } from "@/lib/research/breakdown";

// The analysis, split into the five questions somebody actually asks of a video
// that outperformed: what was said, what the idea was, how it opened, how it was
// told, how it looked.
//
// Tabs rather than one long page because these are alternatives, not a sequence
// — a person looking for the hook does not want to scroll past the transcript to
// find it.

const TABS = [
  { id: "transcript", label: "Transcript", icon: "mic" },
  { id: "idea", label: "Idea analysis", icon: "flask" },
  { id: "hook", label: "Hook", icon: "key" },
  { id: "format", label: "Storytelling format", icon: "layout" },
  { id: "visual", label: "Visual layout", icon: "filmstrip" },
] as const satisfies readonly { id: string; label: string; icon: IconName }[];

type TabId = (typeof TABS)[number]["id"];

export function AnalysisTabs({
  breakdown,
  transcript,
  transcriptNote,
}: {
  breakdown: Breakdown | null;
  transcript: string | null;
  transcriptNote: string | null;
}) {
  const [tab, setTab] = useState<TabId>(breakdown ? "idea" : "transcript");
  const [copied, setCopied] = useState(false);

  const wordCount = transcript
    ? transcript.trim().split(/\s+/).filter(Boolean).length
    : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="-mx-1 overflow-x-auto">
        <div className="flex w-max gap-1 px-1">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[14.5px] whitespace-nowrap transition-[background-color,color] duration-110 ${
                tab === item.id
                  ? "bg-chip font-medium text-ink"
                  : "text-muted hover:text-ink"
              }`}
            >
              <Icon name={item.icon} className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <section className="rounded-lg border border-line bg-panel p-5">
        {tab === "transcript" ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[14.5px] font-semibold">
                Transcript
                {wordCount > 0 ? (
                  <span className="ml-2">
                    <Pill>{wordCount} words</Pill>
                  </span>
                ) : null}
              </h3>
              {transcript ? (
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(transcript);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                  className="text-[13px] text-faint transition-colors hover:text-ink"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              ) : null}
            </div>
            {transcript ? (
              <p className="mt-3 max-h-96 overflow-y-auto text-[14.5px] leading-relaxed whitespace-pre-wrap text-muted italic">
                {transcript}
              </p>
            ) : (
              <p className="mt-2 text-[14.5px] text-faint">{transcriptNote}</p>
            )}
          </>
        ) : !breakdown ? (
          <p className="text-[14.5px] text-faint">
            Break this video down first — the tabs above fill in from the
            analysis, not from the title.
          </p>
        ) : tab === "idea" ? (
          <div className="flex flex-col gap-4">
            <Labelled label="Topic">{breakdown.topic}</Labelled>
            <Labelled label="Idea seed">{breakdown.ideaSeed}</Labelled>
            <Labelled label="Unique angle">{breakdown.uniqueAngle}</Labelled>
            <Labelled label="Common belief to challenge">
              {breakdown.commonBelief}
            </Labelled>
            <Labelled label="Contrarian reality">
              {breakdown.contrarianReality}
            </Labelled>
            <Labelled label="The transferable part">{breakdown.takeaway}</Labelled>
          </div>
        ) : tab === "hook" ? (
          <div className="flex flex-col gap-4">
            {breakdown.hookType ? (
              <div>
                <p className="text-[11.5px] font-semibold tracking-widest text-faint uppercase">
                  Category
                </p>
                <p className="mt-1.5">
                  <Pill tone="accent">
                    {HOOK_TYPE_LABELS[breakdown.hookType].split(" — ")[0]}
                  </Pill>
                </p>
                <p className="mt-1 text-[13px] text-faint">
                  {HOOK_TYPE_LABELS[breakdown.hookType].split(" — ")[1]}
                </p>
              </div>
            ) : null}
            <Labelled label="Formula" mono>
              {breakdown.hookFormula}
            </Labelled>
            <Labelled label="Spoken hook" quote>
              {breakdown.hook}
            </Labelled>
            <Labelled label="Text hook" quote>
              {breakdown.textHook}
            </Labelled>
            <Labelled label="Alignment">{breakdown.hookAlignment}</Labelled>
            <Labelled label="Curiosity loop">{breakdown.curiosityLoop}</Labelled>
          </div>
        ) : tab === "format" ? (
          <div className="flex flex-col gap-4">
            {breakdown.formatCategory ? (
              <div>
                <p className="text-[11.5px] font-semibold tracking-widest text-faint uppercase">
                  Category
                </p>
                <p className="mt-1.5">
                  <Pill tone="info">{breakdown.formatCategory}</Pill>
                </p>
              </div>
            ) : null}
            <Labelled label="Description">{breakdown.formatNotes}</Labelled>
            <Labelled label="Why it works here">
              {breakdown.formatAnalysis}
            </Labelled>
            {breakdown.structure.length > 0 ? (
              <div>
                <p className="text-[11.5px] font-semibold tracking-widest text-faint uppercase">
                  Beats
                </p>
                <ol className="mt-2 flex flex-col gap-2">
                  {breakdown.structure.map((beat, index) => (
                    <li key={index} className="flex gap-3 text-[14.5px]">
                      <span className="w-16 shrink-0 text-[13px] text-faint uppercase">
                        {beat.label}
                      </span>
                      <span className="text-ink">{beat.detail}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Labelled label="Visual treatment">{breakdown.visualLayout}</Labelled>
            <Labelled label="Notes">{breakdown.notes}</Labelled>
          </div>
        )}
      </section>
    </div>
  );
}

function Labelled({
  label,
  children,
  quote,
  mono,
}: {
  label: string;
  children: string | null;
  quote?: boolean;
  mono?: boolean;
}) {
  // A field the model could not fill is left out rather than rendered empty:
  // an empty row reads as "the video had no hook", which is a different and
  // wrong claim.
  if (!children) return null;
  return (
    <div>
      <p className="text-[11.5px] font-semibold tracking-widest text-faint uppercase">
        {label}
      </p>
      <p
        className={`mt-1 text-[14.5px] leading-relaxed ${
          quote ? "text-ink italic" : "text-ink"
        } ${mono ? "font-mono text-[13px]" : ""}`}
      >
        {quote ? `“${children}”` : children}
      </p>
    </div>
  );
}
