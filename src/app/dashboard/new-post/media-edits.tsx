"use client";

import { useState } from "react";

import { Icon } from "@/components/icons";
import { cx } from "@/components/ui";
import {
  clampEdit,
  formatSeconds,
  trimmedDuration,
  type MediaEdit,
} from "@/lib/media/edit";

// The two edits that sit beside the clip: how loud it is, and where it starts
// and stops. Deliberately only those two.
//
// Speed was in the reference and was dropped on the owner's say-so. It is also
// the one of the three that cannot be done cheaply — changing the rate means
// re-encoding every frame, where a trim is a remux and a volume change touches
// only the audio track.
//
// Each control opens on press rather than sitting open: two sliders and a pair
// of time handles permanently beside a 300px video is more furniture than the
// screen can hold, and neither is needed by most posts.

export function MediaEdits({
  edit,
  duration,
  onChange,
}: {
  edit: MediaEdit;
  /** Seconds, from the video element's own metadata. 0 until it loads. */
  duration: number;
  onChange: (next: MediaEdit) => void;
}) {
  const [open, setOpen] = useState<"audio" | "trim" | null>(null);
  const ready = duration > 0;
  const end = edit.endSec ?? duration;
  const kept = trimmedDuration(edit, duration);

  const set = (patch: Partial<MediaEdit>) =>
    onChange(clampEdit({ ...edit, ...patch }, duration));

  const muted = edit.volume === 0;
  const trimmed = edit.startSec > 0.07 || (ready && end < duration - 0.07);

  const tool = (
    id: "audio" | "trim",
    icon: "chat" | "sort",
    label: string,
    active: boolean,
    hint: string,
  ) => (
    <button
      type="button"
      onClick={() => setOpen((current) => (current === id ? null : id))}
      title={hint}
      aria-expanded={open === id}
      className={cx(
        "flex w-[62px] flex-col items-center gap-1.5 rounded-2xl px-2 py-3 transition-[background,color] duration-150",
        open === id
          ? "bg-chip text-ink"
          : active
            ? "text-accent hover:bg-chip"
            : "text-muted hover:bg-chip hover:text-ink",
      )}
    >
      <Icon name={icon} className="h-[22px] w-[22px]" />
      <span className="text-[11.5px] font-semibold">{label}</span>
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col items-center gap-1">
        {tool(
          "audio",
          "chat",
          muted ? "Muted" : "Audio",
          muted || edit.volume < 1,
          "How loud the clip is. It does not change the sound itself.",
        )}
        {tool(
          "trim",
          "sort",
          "Trim",
          trimmed,
          "Cut time off the start or the end. Nothing in the middle is touched.",
        )}
      </div>

      {open === "audio" ? (
        <div className="w-[230px] rounded-2xl border border-line bg-panel px-4 py-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-ink">Volume</span>
            <span className="text-[12.5px] tabular-nums text-muted">
              {Math.round(edit.volume * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(edit.volume * 100)}
            aria-label="Volume"
            onChange={(event) =>
              set({ volume: Number(event.target.value) / 100 })
            }
            className="mt-2.5 w-full accent-[var(--accent)]"
          />
          <div className="mt-1 flex items-center justify-between">
            <button
              type="button"
              onClick={() => set({ volume: 0 })}
              className="text-[12px] font-semibold text-muted hover:text-ink"
            >
              Mute
            </button>
            <button
              type="button"
              onClick={() => set({ volume: 1 })}
              className="text-[12px] font-semibold text-muted hover:text-ink"
            >
              Reset
            </button>
          </div>
        </div>
      ) : null}

      {open === "trim" ? (
        <div className="w-[230px] rounded-2xl border border-line bg-panel px-4 py-3.5">
          {ready ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-ink">
                  {formatSeconds(edit.startSec)} – {formatSeconds(end)}
                </span>
                <span className="text-[12.5px] tabular-nums text-muted">
                  {kept === null ? "" : `${formatSeconds(kept)} kept`}
                </span>
              </div>

              <label className="mt-2.5 block text-[12px] text-muted">
                Start
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, duration)}
                  step={0.1}
                  value={edit.startSec}
                  aria-label="Trim start"
                  onChange={(event) =>
                    set({ startSec: Number(event.target.value) })
                  }
                  className="mt-1 w-full accent-[var(--accent)]"
                />
              </label>
              <label className="mt-1.5 block text-[12px] text-muted">
                End
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, duration)}
                  step={0.1}
                  value={end}
                  aria-label="Trim end"
                  onChange={(event) =>
                    set({ endSec: Number(event.target.value) })
                  }
                  className="mt-1 w-full accent-[var(--accent)]"
                />
              </label>

              <div className="mt-1 flex items-center justify-between">
                <span
                  className="text-[11.5px] text-faint"
                  title="The cut lands on the nearest keyframe at or before the point you choose, which keeps the picture untouched and the edit instant."
                >
                  Cuts to the nearest keyframe
                </span>
                <button
                  type="button"
                  onClick={() => set({ startSec: 0, endSec: duration })}
                  className="text-[12px] font-semibold text-muted hover:text-ink"
                >
                  Reset
                </button>
              </div>
            </>
          ) : (
            <p className="text-[12.5px] text-faint">
              Reading the clip&apos;s length…
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
