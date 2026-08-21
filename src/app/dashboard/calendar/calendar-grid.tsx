"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useSyncExternalStore } from "react";

import { Pill } from "@/components/ui";
import {

  parseView,
  rangeFor,
  rangeLabel,
  sameDay,
  shift,
  toDateParam,
  fromDateParam,
  type CalendarView,
} from "@/lib/publish/calendar";

// The schedule, laid out.
//
// A client component because the calendar is entirely about the viewer's own
// clock: which day is today, where the "now" line falls, what "this week"
// means. Rendering that on the server would put the box's timezone on the
// screen instead of the user's, which for a scheduling tool is not a detail.
//
// The posts come from the server as plain rows with ISO timestamps; every date
// decision happens here.

export type CalendarPost = {
  id: string;
  caption: string;
  status: string;
  scheduledFor: string;
  thumbnail: string | null;
  platforms: string[];
  accounts: string[];
};

/**
 * The current minute, or null on the server.
 *
 * This component is server-rendered first, so reading the clock during render
 * would format every time in the droplet's timezone and highlight the server's
 * "today", then hydrate to something different. useSyncExternalStore is the
 * primitive for exactly this: a server snapshot that is honestly null, a client
 * snapshot that ticks. Until it resolves, the grid draws without a now-line or
 * a today highlight — absent rather than wrong.
 */
function useClientClock(): Date | null {
  const iso = useSyncExternalStore(
    subscribeToMinute,
    () => minuteKey(),
    () => null,
  );
  return iso === null ? null : new Date(iso);
}

/** The current time truncated to the minute, so the snapshot is stable between
 *  renders and the component only re-renders when the minute changes. */
function minuteKey(): string {
  const at = new Date();
  at.setSeconds(0, 0);
  return at.toISOString();
}

function subscribeToMinute(onChange: () => void): () => void {
  const timer = setInterval(onChange, 30_000);
  return () => clearInterval(timer);
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
/** One hour's height, in rem. The h-12 rows below and the absolute offsets
 *  computed from a post's time have to agree, so the number lives here. */
const HOUR_HEIGHT_REM = 3;
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STATUS_TONE: Record<string, "ok" | "warn" | "danger" | "neutral" | "info"> = {
  scheduled: "info",
  publishing: "warn",
  published: "ok",
  partial: "warn",
  failed: "danger",
  canceled: "neutral",
  draft: "neutral",
};

export function CalendarGrid({
  posts,
  today,
}: {
  posts: CalendarPost[];
  /** The server's idea of now, only as a fallback anchor. */
  today: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const now = useClientClock();

  const view = parseView(params.get("view") ?? undefined);
  const anchor = fromDateParam(params.get("date") ?? undefined, new Date(today));
  const { days } = useMemo(() => rangeFor(view, anchor), [view, anchor]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarPost[]>();
    for (const post of posts) {
      const key = toDateParam(new Date(post.scheduledFor));
      const bucket = map.get(key);
      if (bucket) bucket.push(post);
      else map.set(key, [post]);
    }
    for (const bucket of map.values()) {
      bucket.sort(
        (a, b) =>
          new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime(),
      );
    }
    return map;
  }, [posts]);

  const go = (next: Partial<{ view: CalendarView; date: Date }>) => {
    const search = new URLSearchParams(params.toString());
    if (next.view) search.set("view", next.view);
    if (next.date) search.set("date", toDateParam(next.date));
    router.push(`/dashboard/calendar?${search.toString()}`);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">{rangeLabel(view, anchor)}</h2>

        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous"
            onClick={() => go({ date: shift(view, anchor, -1) })}
            className="rounded-lg border border-line px-2.5 py-1.5 text-sm text-ink transition hover:border-line-strong"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => go({ date: now ?? new Date() })}
            className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink transition hover:border-line-strong"
          >
            Today
          </button>
          <button
            type="button"
            aria-label="Next"
            onClick={() => go({ date: shift(view, anchor, 1) })}
            className="rounded-lg border border-line px-2.5 py-1.5 text-sm text-ink transition hover:border-line-strong"
          >
            ›
          </button>
        </div>

        <div className="ml-auto flex gap-1 rounded-lg bg-chip p-1">
          {(["month", "week", "day"] as CalendarView[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => go({ view: item })}
              className={`rounded-md px-3 py-1 text-sm capitalize transition ${
                view === item
                  ? "bg-chip font-medium text-ink"
                  : "text-muted hover:text-ink"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {view === "month" ? (
        <MonthGrid days={days} anchor={anchor} byDay={byDay} now={now} />
      ) : (
        <TimeGrid days={days} byDay={byDay} now={now} />
      )}
    </div>
  );
}

function MonthGrid({
  days,
  anchor,
  byDay,
  now,
}: {
  days: Date[];
  anchor: Date;
  byDay: Map<string, CalendarPost[]>;
  /** Null until the client has mounted — see the note in CalendarGrid. */
  now: Date | null;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <div className="grid grid-cols-7 border-b border-line bg-panel">
        {DAY_NAMES.map((name) => (
          <div
            key={name}
            className="px-2 py-1.5 text-center text-[10px] font-semibold tracking-widest text-faint uppercase"
          >
            {name}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const posts = byDay.get(toDateParam(day)) ?? [];
          const outside = day.getMonth() !== anchor.getMonth();
          const isToday = now !== null && sameDay(day, now);
          return (
            <div
              key={day.toISOString()}
              className={`min-h-24 border-r border-b border-line p-1.5 last:border-r-0 ${
                outside ? "bg-panel" : ""
              }`}
            >
              <p
                className={`text-xs ${
                  isToday
                    ? "font-semibold text-danger"
                    : outside
                      ? "text-faint"
                      : "text-faint"
                }`}
              >
                {day.getDate()}
              </p>
              <ul className="mt-1 flex flex-col gap-1">
                {posts.slice(0, 3).map((post) => (
                  <li key={post.id}>
                    <PostChip post={post} compact mounted={now !== null} />
                  </li>
                ))}
                {posts.length > 3 ? (
                  <li className="text-[10px] text-faint">
                    +{posts.length - 3} more
                  </li>
                ) : null}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimeGrid({
  days,
  byDay,
  now,
}: {
  days: Date[];
  byDay: Map<string, CalendarPost[]>;
  now: Date | null;
}) {
  // Every hour is drawn, because a post at 05:30 that is simply not rendered
  // is worse than a few empty rows — the day looks empty and the user goes
  // looking for a bug. The grid opens scrolled to the first hour that has
  // something in it (or 6am), which gets the same benefit honestly.
  const visibleHours = HOURS;
  const earliest = Math.min(
    6,
    ...[...byDay.values()]
      .flat()
      .map((post) => new Date(post.scheduledFor).getHours()),
  );
  const scrollTo = Math.max(0, earliest) * HOUR_HEIGHT_REM;
  const nowOffset =
    now === null ? null : now.getHours() * HOUR_HEIGHT_REM + (now.getMinutes() / 60) * HOUR_HEIGHT_REM;

  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <div className="min-w-[44rem]">
        <div
          className="grid border-b border-line bg-panel"
          style={{ gridTemplateColumns: `4rem repeat(${days.length}, 1fr)` }}
        >
          <div />
          {days.map((day) => {
            const isToday = now !== null && sameDay(day, now);
            return (
              <div key={day.toISOString()} className="px-2 py-2 text-center">
                <p className="text-[10px] tracking-widest text-faint uppercase">
                  {DAY_NAMES[day.getDay()]}
                </p>
                <p
                  className={`text-sm ${isToday ? "font-semibold text-danger" : "text-ink"}`}
                >
                  {day.getDate()}
                </p>
              </div>
            );
          })}
        </div>

        <div
          className="relative max-h-[32rem] overflow-y-auto"
          ref={(node) => {
            // Only on first attach: re-scrolling on every render would fight
            // somebody who has scrolled somewhere else.
            if (node && node.scrollTop === 0) {
              node.scrollTop = scrollTo * 16;
            }
          }}
        >
          {now !== null && nowOffset !== null && days.some((day) => sameDay(day, now)) ? (
            <div
              className="pointer-events-none absolute right-0 left-16 z-10 border-t border-danger"
              style={{ top: `${nowOffset}rem` }}
            >
              <span className="absolute -top-2 -left-14 text-[10px] text-danger">
                {now.toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            </div>
          ) : null}

          <div
            className="grid"
            style={{ gridTemplateColumns: `4rem repeat(${days.length}, 1fr)` }}
          >
            <div>
              {visibleHours.map((hour) => (
                <div
                  key={hour}
                  className="h-12 border-b border-line pr-2 text-right text-[10px] text-faint"
                >
                  {hour === 0
                    ? "12 AM"
                    : hour < 12
                      ? `${hour} AM`
                      : hour === 12
                        ? "12 PM"
                        : `${hour - 12} PM`}
                </div>
              ))}
            </div>

            {days.map((day) => {
              const posts = byDay.get(toDateParam(day)) ?? [];
              return (
                <div
                  key={day.toISOString()}
                  className="relative border-l border-line"
                >
                  {visibleHours.map((hour) => (
                    <div key={hour} className="h-12 border-b border-line" />
                  ))}
                  {posts.map((post) => {
                    const at = new Date(post.scheduledFor);
                    const top =
                      at.getHours() * HOUR_HEIGHT_REM +
                      (at.getMinutes() / 60) * HOUR_HEIGHT_REM;
                    return (
                      <div
                        key={post.id}
                        className="absolute right-1 left-1"
                        style={{ top: `${top}rem` }}
                      >
                        <PostChip post={post} mounted={now !== null} />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function PostChip({
  post,
  compact,
  mounted,
}: {
  post: CalendarPost;
  compact?: boolean;
  /** False during the server pass. A clock time formatted there would be the
   *  droplet's timezone, and React keeps whatever the server wrote — so the
   *  time is left out until the client has it. */
  mounted: boolean;
}) {
  const at = new Date(post.scheduledFor);
  const time = mounted
    ? at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : "";

  return (
    <Link
      href={
        post.status === "draft"
          ? `/dashboard/compose?draft=${post.id}`
          : "/dashboard/posts"
      }
      title={`${time ? `${time} · ` : ""}${post.accounts.join(", ")}\n${post.caption}`}
      className="block overflow-hidden rounded-md border border-line-strong bg-chip transition hover:border-line-strong"
    >
      <div className="flex items-start gap-1.5 p-1">
        {post.thumbnail && !compact ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.thumbnail}
            alt=""
            className="h-8 w-6 shrink-0 rounded object-cover"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-[10px] text-muted">
            {time ? <span>{time}</span> : null}
            <span className="truncate uppercase">
              {post.platforms.slice(0, 3).join(" ")}
            </span>
          </p>
          <p className="truncate text-[11px] text-ink">
            {post.caption || "No caption"}
          </p>
        </div>
      </div>
      {post.status !== "scheduled" ? (
        <p className="px-1 pb-1">
          <Pill tone={STATUS_TONE[post.status] ?? "neutral"}>{post.status}</Pill>
        </p>
      ) : null}
    </Link>
  );
}

