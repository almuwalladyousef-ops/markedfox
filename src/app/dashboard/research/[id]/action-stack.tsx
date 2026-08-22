"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Kbd } from "@/components/ui";
import type { Breakdown } from "@/lib/research/breakdown";
import { saveToProjectAction } from "@/lib/research/actions";
import {
  createScriptDraftAction,
  saveHookAction,
  shortlistVideoAction,
} from "@/lib/research/studio-actions";

// Every action available on one analysed video, each with the key that fires
// it. The shortcuts are the point: working a feed means opening, judging and
// moving on, and reaching for the mouse five times per video is what makes
// people stop after four.

export function ActionStack({
  videoId,
  videoUrl,
  breakdown,
  transcript,
  projects,
  hookSaved,
  shortlisted,
  exportText,
}: {
  videoId: string;
  videoUrl: string;
  breakdown: Breakdown | null;
  transcript: string | null;
  projects: { id: string; name: string }[];
  hookSaved: boolean;
  shortlisted: boolean;
  exportText: string;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const scriptRef = useRef<HTMLButtonElement>(null);
  const shortlistRef = useRef<HTMLButtonElement>(null);
  const hookRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      // Never steal a key from someone typing — including inside the note
      // fields and selects on this same page.
      const target = event.target as HTMLElement | null;
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        (target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.tagName === "SELECT" ||
            target.isContentEditable))
      ) {
        return;
      }

      switch (event.key.toLowerCase()) {
        case "c":
          scriptRef.current?.click();
          break;
        case "s":
          shortlistRef.current?.click();
          break;
        case "h":
          hookRef.current?.click();
          break;
        case "e":
          void navigator.clipboard.writeText(exportText);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
          break;
        case "o":
          window.open(videoUrl, "_blank", "noopener,noreferrer");
          break;
        case "escape":
          router.push("/dashboard/research");
          break;
        default:
          return;
      }
      event.preventDefault();
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [exportText, router, videoUrl]);

  return (
    <div className="flex flex-col gap-2">
      <form action={createScriptDraftAction}>
        <input type="hidden" name="video_id" value={videoId} />
        <input
          type="hidden"
          name="topic"
          value={breakdown?.ideaSeed ?? breakdown?.topic ?? ""}
        />
        <Row
          ref={scriptRef}
          tone="primary"
          label="Create script"
          shortcut="C"
        />
      </form>

      <form action={shortlistVideoAction}>
        <input type="hidden" name="video_id" value={videoId} />
        <Row
          ref={shortlistRef}
          label={shortlisted ? "Shortlisted ✓" : "Shortlist idea"}
          shortcut="S"
          disabled={shortlisted}
        />
      </form>

      {projects.length > 0 ? (
        <form action={saveToProjectAction} className="flex gap-1.5">
          <input type="hidden" name="video_id" value={videoId} />
          <select
            name="project_id"
            aria-label="Project"
            className="min-w-0 flex-1 rounded-lg border border-line bg-chip px-2 py-2 text-[13px] outline-none focus:border-line-strong"
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg border border-line px-3 py-2 text-[13px] text-ink transition hover:border-line-strong"
          >
            Add
          </button>
        </form>
      ) : null}

      {breakdown?.hookFormula ? (
        <form action={saveHookAction}>
          <input type="hidden" name="video_id" value={videoId} />
          <input type="hidden" name="formula" value={breakdown.hookFormula} />
          <input type="hidden" name="example" value={breakdown.hook ?? ""} />
          <input
            type="hidden"
            name="category"
            value={breakdown.hookType ?? ""}
          />
          <Row
            ref={hookRef}
            label={hookSaved ? "Hook saved ✓" : "Save hook to vault"}
            shortcut="H"
            disabled={hookSaved}
          />
        </form>
      ) : null}

      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(exportText);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="flex w-full items-center justify-between rounded-lg border border-line px-3 py-2 text-[14.5px] text-ink transition hover:border-line-strong hover:text-ink"
      >
        <span>{copied ? "Copied" : "Copy for an LLM"}</span>
        <Kbd>E</Kbd>
      </button>

      <a
        href={videoUrl}
        target="_blank"
        rel="noreferrer noopener"
        className="flex w-full items-center justify-between rounded-lg border border-line px-3 py-2 text-[14.5px] text-ink transition hover:border-line-strong hover:text-ink"
      >
        <span>Open original</span>
        <Kbd>O</Kbd>
      </a>

      {transcript ? null : (
        <p className="px-1 text-[12.5px] text-faint">
          No transcript yet — fetch one for a sharper breakdown.
        </p>
      )}
    </div>
  );
}

function Row({
  ref,
  label,
  shortcut,
  tone,
  disabled,
}: {
  ref?: React.Ref<HTMLButtonElement>;
  label: string;
  shortcut: string;
  tone?: "primary";
  disabled?: boolean;
}) {
  return (
    <button
      ref={ref}
      type="submit"
      disabled={disabled}
      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-[14.5px] transition disabled:cursor-default disabled:opacity-60 ${
        tone === "primary"
          ? "bg-accent font-medium text-accent-ink hover:brightness-[1.08]"
          : "border border-line text-ink hover:border-line-strong hover:text-ink"
      }`}
    >
      <span>{label}</span>
      <Kbd>{shortcut}</Kbd>
    </button>
  );
}
