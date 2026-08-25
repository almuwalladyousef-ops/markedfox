"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/icons";
import { Button, cx } from "@/components/ui";

// The "Schedule post" dialog: four scrolling wheels — day, hour, minute,
// AM/PM — instead of a `datetime-local` input.
//
// The native input was one line and cost nothing, and it is still what a
// keyboard reaches; this exists because picking "tomorrow at 9" from a text
// field means typing a date, and picking it from a wheel means two flicks. The
// wheels are real scroll containers with snap points rather than a bespoke
// drag, so a trackpad, a wheel, a touchscreen and the arrow keys all work
// without any of them being implemented here.

type Props = {
  /** Local "YYYY-MM-DDTHH:MM", the same shape the composer already stores. */
  value: string;
  onChange: (next: string) => void;
  onConfirm: () => void;
  onClose: () => void;
  /** Disabled while a commit is in flight. */
  busy?: boolean;
  confirmLabel: string;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** One row, and the padding above the first one. Both are also written in the
 *  wheel's classes (`h-9`, `py-[48px]`); they are here as numbers because the
 *  scroll position is computed from them rather than measured. */
const ROW_HEIGHT = 36;

function toLocalValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Parses the composer's value, falling back to an hour from now — a dialog
 *  that opens on a blank or malformed value should still be usable. */
function parseValue(value: string): Date {
  const parsed = new Date(value);
  if (Number.isFinite(parsed.getTime())) return parsed;
  return new Date(Date.now() + 60 * 60 * 1000);
}

function startOfDay(date: Date): Date {
  const out = new Date(date);
  out.setHours(0, 0, 0, 0);
  return out;
}

/** One wheel. `options` are value/label pairs; the selected one is centred by
 *  scrolling to it, and scrolling is what changes the selection. */
function Wheel({
  options,
  value,
  onSelect,
  label,
  className,
}: {
  options: { value: number; label: string }[];
  value: number;
  onSelect: (next: number) => void;
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const index = options.findIndex((option) => option.value === value);

  // Bring the selection into view whenever it changes from outside — opening
  // the dialog, or another wheel rolling the day over.
  //
  // The position is computed, not measured. Reading `offsetTop` here was the
  // obvious way and it was wrong: on the first render the dialog has only just
  // been inserted, every row measures 0, and each wheel scrolled to the top
  // while displaying a selection further down. Waiting a frame helped
  // sometimes, which is worse than not working — the rows are a fixed height,
  // so index × row is exact and cannot be raced.
  useEffect(() => {
    const node = ref.current;
    if (!node || index < 0) return;
    node.scrollTop = index * ROW_HEIGHT;
  }, [index]);

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={label}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const next = index + (event.key === "ArrowDown" ? 1 : -1);
          if (next >= 0 && next < options.length) onSelect(options[next].value);
        }
      }}
      className={cx(
        // No `scroll-smooth`: with it, even a direct scrollTop assignment
        // animates, so opening the dialog showed every wheel sliding up from
        // the top instead of already being on the chosen value — and a read
        // straight after the write returned the old position.
        "h-[132px] snap-y snap-mandatory overflow-y-auto py-[48px] text-center outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="option"
            aria-selected={on}
            onClick={() => onSelect(option.value)}
            className={cx(
              "block h-9 w-full snap-center px-2 text-[14px] whitespace-nowrap transition-[color,font-weight] duration-100",
              on ? "font-bold text-ink" : "text-faint hover:text-muted",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function ScheduleDialog({
  value,
  onChange,
  onConfirm,
  onClose,
  busy,
  confirmLabel,
}: Props) {
  const [now] = useState(() => new Date());
  const selected = useMemo(() => parseValue(value), [value]);

  // Escape closes, and focus is trapped only as far as returning it on exit —
  // this is a small dialog, not a page.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const days = useMemo(() => {
    const first = startOfDay(now);
    return Array.from({ length: 90 }, (_, offset) => {
      const date = new Date(first);
      date.setDate(first.getDate() + offset);
      return {
        value: date.getTime(),
        label:
          offset === 0
            ? "Today"
            : offset === 1
              ? "Tomorrow"
              : date.toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                }),
      };
    });
  }, [now]);

  const hour24 = selected.getHours();
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const meridiem = hour24 >= 12 ? 1 : 0;

  const apply = (patch: {
    day?: number;
    hour12?: number;
    minute?: number;
    meridiem?: number;
  }) => {
    const base = new Date(patch.day ?? startOfDay(selected).getTime());
    const nextMeridiem = patch.meridiem ?? meridiem;
    const nextHour12 = patch.hour12 ?? hour12;
    const nextHour24 = (nextHour12 % 12) + nextMeridiem * 12;
    base.setHours(nextHour24, patch.minute ?? selected.getMinutes(), 0, 0);
    onChange(toLocalValue(base));
  };

  // Against the clock read when the dialog opened, not a fresh one: render has
  // to be idempotent, and a minute ticking over mid-render would flip this on
  // a re-render nobody caused.
  const inPast = selected.getTime() <= now.getTime();

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 px-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Schedule post"
        className="relative w-full max-w-[380px] rounded-[22px] border border-line bg-panel p-6 shadow-[0_30px_80px_rgba(0,0,0,.28)]"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 text-faint transition-[color] duration-150 hover:text-ink"
        >
          <Icon name="close" className="h-[18px] w-[18px]" />
        </button>

        <h2 className="font-display text-center text-[17px] font-bold text-ink">
          Schedule post
        </h2>
        <p className="mx-auto mt-1 max-w-[280px] text-center text-[12.5px]/[18px] text-pretty text-faint">
          Choose the date and time below. The time zone is your device&apos;s.
        </p>

        {/* The band behind the middle row is what makes four independent
            scrollers read as one picker. */}
        <div className="relative mt-4">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-1/2 h-9 -translate-y-1/2 rounded-lg bg-chip"
          />
          <div className="relative grid grid-cols-[1.6fr_0.7fr_0.7fr_0.8fr] gap-1">
            <Wheel
              label="Date"
              options={days}
              value={startOfDay(selected).getTime()}
              onSelect={(day) => apply({ day })}
            />
            <Wheel
              label="Hour"
              options={Array.from({ length: 12 }, (_, i) => ({
                value: i + 1,
                label: String(i + 1),
              }))}
              value={hour12}
              onSelect={(next) => apply({ hour12: next })}
            />
            <Wheel
              label="Minute"
              options={Array.from({ length: 60 }, (_, i) => ({
                value: i,
                label: pad(i),
              }))}
              value={selected.getMinutes()}
              onSelect={(minute) => apply({ minute })}
            />
            <Wheel
              label="AM or PM"
              options={[
                { value: 0, label: "AM" },
                { value: 1, label: "PM" },
              ]}
              value={meridiem}
              onSelect={(next) => apply({ meridiem: next })}
            />
          </div>
        </div>

        {inPast ? (
          <p className="mt-2 text-center text-[12.5px] font-semibold text-danger">
            That time has already passed.
          </p>
        ) : null}

        <Button
          type="button"
          tone="ink"
          onClick={onConfirm}
          disabled={busy || inPast}
          className="mt-4 w-full justify-center"
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}
