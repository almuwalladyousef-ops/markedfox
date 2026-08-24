"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";

import { Icon } from "@/components/icons";
import { PlatformIcon, PlatformTile } from "@/components/platform-icon";
import {
  Button,
  ButtonLink,
  buttonClass,
  cx,
  iconButtonClass,
  inputClass,
  segmentedItem,
  segmentedTrack,
} from "@/components/ui";
import { PLATFORM_LABELS } from "@/lib/platforms/labels";
import type { Platform } from "@/lib/platforms/types";
import { cancelPostAction, reschedulePostAction } from "@/lib/publish/actions";
import {
  fromDateParam,
  monthYearParts,
  parseView,
  rangeFor,
  rangeLabel,
  sameDay,
  shift,
  toDateParam,
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
// decision happens here. The view and the anchor date live in the URL so a
// week can be linked to; the platform filter and the search box are local
// state, because the whole window is already in memory and a round trip per
// keystroke would be slower for no gain.

export type CalendarTarget = {
  connectionId: string;
  platform: Platform | null;
  name: string;
  /** null while a post is still scheduled — nothing has happened yet. */
  outcome: "published" | "failed" | null;
  url: string | null;
  error: string | null;
};

export type CalendarPost = {
  id: string;
  caption: string;
  status: string;
  /** When it went out, or when it is due. */
  at: string;
  thumbnail: string | null;
  lastError: string | null;
  targets: CalendarTarget[];
};

export type CalendarAccount = {
  id: string;
  platform: Platform;
  name: string;
  avatarUrl: string | null;
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
/** One hour's height, in rem. The h-14 rows below and the absolute offsets
 *  computed from a post's time have to agree, so the number lives here. */
const HOUR_HEIGHT_REM = 3.5;
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The dot on a chip, and the legend under the grid: one colour per state, so
 *  a month at a glance says what went out and what has not yet. */
const STATUS_DOT: Record<string, string> = {
  scheduled: "bg-sky",
  publishing: "bg-warn",
  published: "bg-ok",
  partial: "bg-warn",
  failed: "bg-danger",
  canceled: "bg-faint",
  draft: "bg-faint",
};

const STATUS_PILL: Record<string, string> = {
  scheduled: "bg-sky-soft text-sky",
  publishing: "bg-warn-soft text-warn",
  published: "bg-ok-soft text-ok",
  partial: "bg-warn-soft text-warn",
  failed: "bg-danger-soft text-danger",
  canceled: "bg-chip text-faint",
  draft: "bg-chip text-muted",
};

const LEGEND = [
  { label: "Scheduled", dot: "bg-sky" },
  { label: "Published", dot: "bg-ok" },
  { label: "Partial", dot: "bg-warn" },
  { label: "Draft with a date", dot: "bg-faint" },
];

export function CalendarGrid({
  posts,
  accounts,
  today,
}: {
  posts: CalendarPost[];
  accounts: CalendarAccount[];
  /** The server's idea of now, only as a fallback anchor. */
  today: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const now = useClientClock();

  const view = parseView(params.get("view") ?? undefined);
  const anchor = fromDateParam(params.get("date") ?? undefined, new Date(today));
  const { days } = useMemo(() => rangeFor(view, anchor), [view, anchor]);

  // An empty set means every platform, which is what somebody who has never
  // touched the filter expects — not an empty calendar. Several selected
  // combine: Instagram and TikTok shows both.
  const [onlyPlatforms, setOnlyPlatforms] = useState<Set<Platform>>(new Set());
  const [query, setQuery] = useState("");
  const [openPostId, setOpenPostId] = useState<string | null>(null);

  // Only the platforms this workspace actually posts to. A filter row offering
  // Pinterest to somebody with two Instagram accounts is six controls that do
  // nothing, and it makes the two that matter harder to find.
  const platforms = useMemo(
    () => [...new Set(accounts.map((account) => account.platform))],
    [accounts],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return posts.filter((post) => {
      if (
        onlyPlatforms.size > 0 &&
        !post.targets.some(
          (target) => target.platform && onlyPlatforms.has(target.platform),
        )
      ) {
        return false;
      }
      if (!needle) return true;
      return (
        post.caption.toLowerCase().includes(needle) ||
        post.targets.some((target) => target.name.toLowerCase().includes(needle))
      );
    });
  }, [posts, onlyPlatforms, query]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarPost[]>();
    for (const post of visible) {
      const key = toDateParam(new Date(post.at));
      const bucket = map.get(key);
      if (bucket) bucket.push(post);
      else map.set(key, [post]);
    }
    for (const bucket of map.values()) {
      bucket.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    }
    return map;
  }, [visible]);

  const openPost = visible.find((post) => post.id === openPostId) ?? null;

  const go = (next: Partial<{ view: CalendarView; date: Date }>) => {
    const search = new URLSearchParams(params.toString());
    if (next.view) search.set("view", next.view);
    if (next.date) search.set("date", toDateParam(next.date));
    router.push(`/dashboard/calendar?${search.toString()}`);
  };

  const togglePlatform = (platform: Platform) => {
    setOnlyPlatforms((current) => {
      const next = new Set(current);
      if (next.has(platform)) next.delete(platform);
      else next.add(platform);
      return next;
    });
  };

  const { month, year } = monthYearParts(anchor);

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-[22px] font-bold tracking-[-0.02em] text-ink">
          {month} <span className="font-medium text-muted">{year}</span>
        </h1>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Previous"
            onClick={() => go({ date: shift(view, anchor, -1) })}
            className={iconButtonClass}
          >
            <Icon name="chevronLeft" className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => go({ date: now ?? new Date() })}
            className={buttonClass("secondary", "xs", "rounded-[9px]")}
          >
            Today
          </button>
          <button
            type="button"
            aria-label="Next"
            onClick={() => go({ date: shift(view, anchor, 1) })}
            className={iconButtonClass}
          >
            <Icon name="chevronRight" className="h-4 w-4" />
          </button>
          {/* Jumping to an arbitrary date without paging there one week at a
              time. A plain date input, because the browser already has a date
              picker and it is the one the person knows. */}
          <label
            className={cx(iconButtonClass, "cursor-pointer")}
            title="Jump to a date"
          >
            <Icon name="calendar" className="h-4 w-4" />
            <span className="sr-only">Jump to a date</span>
            <input
              type="date"
              value={toDateParam(anchor)}
              onChange={(event) => {
                const picked = fromDateParam(event.target.value, anchor);
                go({ date: picked });
              }}
              className="sr-only"
            />
          </label>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2.5">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search posts"
            aria-label="Search posts"
            className={cx(inputClass, "w-[190px] rounded-full py-2 text-[13px]")}
          />
          <div className={segmentedTrack}>
            {(["month", "week", "day"] as CalendarView[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => go({ view: item })}
                aria-pressed={view === item}
                className={segmentedItem(view === item, "px-4 capitalize")}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* The platform filter, centred over the grid rather than tucked into a
          toolbar: it is the control people reach for most, and it combines —
          Instagram plus TikTok shows both, not neither. */}
      {platforms.length > 1 ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setOnlyPlatforms(new Set())}
            aria-pressed={onlyPlatforms.size === 0}
            className={cx(
              "inline-flex h-10 items-center justify-center rounded-[13px] border px-4 text-[13px] font-semibold transition-[background,color,border-color,opacity] duration-150",
              onlyPlatforms.size === 0
                ? "border-ink bg-ink text-panel"
                : "border-line bg-panel text-muted opacity-55 hover:opacity-100",
            )}
          >
            All
          </button>
          {platforms.map((platform) => {
            const on = onlyPlatforms.has(platform);
            return (
              <button
                key={platform}
                type="button"
                onClick={() => togglePlatform(platform)}
                aria-pressed={on}
                title={PLATFORM_LABELS[platform]}
                className={cx(
                  "inline-flex h-10 w-10 items-center justify-center rounded-[13px] border transition-[background,border-color,opacity] duration-150",
                  on
                    ? "border-ink bg-ink"
                    : "border-line bg-panel opacity-55 hover:opacity-100",
                )}
              >
                <PlatformTile platform={platform} size={24} />
                <span className="sr-only">{PLATFORM_LABELS[platform]}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <p className="-mt-1 text-center text-[12.5px] text-faint">
        {rangeLabel(view, anchor)}
      </p>

      {view === "month" ? (
        <MonthGrid
          days={days}
          anchor={anchor}
          byDay={byDay}
          now={now}
          onOpen={setOpenPostId}
        />
      ) : (
        <TimeGrid days={days} byDay={byDay} now={now} onOpen={setOpenPostId} />
      )}

      <ul className="flex flex-wrap items-center gap-5 text-[12.5px] text-faint">
        {LEGEND.map((item) => (
          <li key={item.label} className="flex items-center gap-2">
            <span aria-hidden className={`h-[7px] w-[7px] rounded-full ${item.dot}`} />
            {item.label}
          </li>
        ))}
      </ul>

      {openPost ? (
        <PostDetail post={openPost} onClose={() => setOpenPostId(null)} mounted={now !== null} />
      ) : null}
    </div>
  );
}


function MonthGrid({
  days,
  anchor,
  byDay,
  now,
  onOpen,
}: {
  days: Date[];
  anchor: Date;
  byDay: Map<string, CalendarPost[]>;
  /** Null until the client has mounted — see the note in CalendarGrid. */
  now: Date | null;
  onOpen: (id: string) => void;
}) {
  // A month that fits in five rows gets five rows: the sixth is entirely next
  // month, and an empty grey band at the bottom reads as missing content.
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  const shown = weeks.filter(
    (week, index) =>
      index < weeks.length - 1 ||
      week.some((day) => day.getMonth() === anchor.getMonth()),
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-panel">
      <div className="grid grid-cols-7 bg-chip">
        {DAY_NAMES.map((name) => (
          <div
            key={name}
            className="px-2 py-2 text-center text-[10.5px] font-bold tracking-[0.1em] text-faint uppercase"
          >
            {name}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {shown.flat().map((day) => {
          const posts = byDay.get(toDateParam(day)) ?? [];
          const outside = day.getMonth() !== anchor.getMonth();
          const isToday = now !== null && sameDay(day, now);
          return (
            <div
              key={day.toISOString()}
              // The cell height is derived from the viewport rather than fixed,
              // so a month fills the screen it is being read on instead of
              // leaving a band of empty page under a squat grid — or, on a
              // laptop, pushing the last week below the fold.
              style={{ minHeight: `max(6rem, calc((100vh - 300px) / ${shown.length}))` }}
              className={cx(
                "border-r border-b border-line p-2 last:border-r-0",
                outside && "bg-bg",
              )}
            >
              <p>
                <span
                  className={cx(
                    "font-display inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full text-[12.5px] font-semibold",
                    isToday
                      ? "bg-accent font-bold text-accent-ink"
                      : outside
                        ? "text-line-strong"
                        : "text-muted",
                  )}
                >
                  {day.getDate()}
                </span>
              </p>
              <ul className="mt-1.5 flex flex-col gap-1">
                {posts.slice(0, 3).map((post) => (
                  <li key={post.id}>
                    <PostChip post={post} mounted={now !== null} onOpen={onOpen} />
                  </li>
                ))}
                {posts.length > 3 ? (
                  <li className="px-1 text-[11.5px] text-faint">
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
  onOpen,
}: {
  days: Date[];
  byDay: Map<string, CalendarPost[]>;
  now: Date | null;
  onOpen: (id: string) => void;
}) {
  // Every hour is drawn, because a post at 05:30 that is simply not rendered
  // is worse than a few empty rows — the day looks empty and the user goes
  // looking for a bug. The grid opens scrolled to the first hour that has
  // something in it (or 6am), which gets the same benefit honestly.
  const earliest = Math.min(
    6,
    ...[...byDay.values()].flat().map((post) => new Date(post.at).getHours()),
  );
  const scrollTo = Math.max(0, earliest) * HOUR_HEIGHT_REM;
  const nowOffset =
    now === null
      ? null
      : now.getHours() * HOUR_HEIGHT_REM + (now.getMinutes() / 60) * HOUR_HEIGHT_REM;

  return (
    <div className="overflow-x-auto rounded-[18px] border border-line bg-panel">
      <div className="min-w-[52rem]">
        <div
          className="grid border-b border-line bg-panel"
          style={{ gridTemplateColumns: `4rem repeat(${days.length}, 1fr)` }}
        >
          <div />
          {days.map((day) => {
            const isToday = now !== null && sameDay(day, now);
            return (
              <div key={day.toISOString()} className="px-2 py-2 text-center">
                <span
                  className={`text-[12px] ${isToday ? "font-bold text-danger" : "text-muted"}`}
                >
                  {isToday ? "● " : ""}
                  {DAY_NAMES[day.getDay()]} {day.getDate()}
                </span>
              </div>
            );
          })}
        </div>

        <div
          // Scrolls, but without the grey bar down the side of the panel.
          className="relative max-h-[34rem] overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="h-14 border-b border-line pr-2 text-right text-[9.5px] text-faint"
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
                <div key={day.toISOString()} className="relative border-l border-line">
                  {HOURS.map((hour) => (
                    <div key={hour} className="h-14 border-b border-line" />
                  ))}
                  {layOut(posts).map(({ post, top, column, columns }) => (
                    <div
                      key={post.id}
                      className="absolute px-[3px]"
                      style={{
                        top: `${top}rem`,
                        // Posts scheduled minutes apart sit side by side
                        // rather than on top of each other — three posts at
                        // 6am is a normal morning, and one card hiding the
                        // other two is how a person misses a mistake.
                        left: `${(column / columns) * 100}%`,
                        width: `${100 / columns}%`,
                      }}
                    >
                      <PostCard post={post} mounted={now !== null} onOpen={onOpen} />
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/** How tall a card draws, as a fraction of an hour. Two posts closer together
 *  than this overlap on screen and have to share the column's width. */
const CARD_HOURS = 4.4 / 3.5;

/**
 * Place a day's posts: vertical offset from the time, and a column within any
 * cluster of posts close enough to overlap. Pure, so the arithmetic is
 * testable — and it is the arithmetic that decides whether a post is visible
 * at all.
 */
export function layOut<T extends { id: string; at: string }>(
  posts: T[],
): { post: T; top: number; column: number; columns: number }[] {
  const placed = posts
    .map((post) => {
      const at = new Date(post.at);
      return { post, hour: at.getHours() + at.getMinutes() / 60 };
    })
    .sort((a, b) => a.hour - b.hour);

  const out: { post: T; top: number; column: number; columns: number }[] = [];
  let cluster: typeof placed = [];

  const flush = () => {
    for (const [index, item] of cluster.entries()) {
      out.push({
        post: item.post,
        top: item.hour * HOUR_HEIGHT_REM,
        column: index,
        columns: cluster.length,
      });
    }
    cluster = [];
  };

  for (const item of placed) {
    // A post joins the cluster when it starts before the previous card's
    // bottom edge; otherwise the cluster is finished and it starts a new one.
    if (cluster.length > 0 && item.hour - cluster[cluster.length - 1].hour >= CARD_HOURS) {
      flush();
    }
    cluster.push(item);
  }
  flush();
  return out;
}

function localTime(at: Date, mounted: boolean): string {
  return mounted
    ? at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : "";
}

/** The week and day view's card: the post's own thumbnail, the time it goes
 *  out, and which accounts it goes to — enough to recognise a post without
 *  opening it, which is the entire job of a calendar. */
function PostCard({
  post,
  mounted,
  onOpen,
}: {
  post: CalendarPost;
  mounted: boolean;
  onOpen: (id: string) => void;
}) {
  const at = new Date(post.at);
  const time = localTime(at, mounted);
  const platforms = [
    ...new Set(
      post.targets
        .map((target) => target.platform)
        .filter((platform): platform is Platform => Boolean(platform)),
    ),
  ];

  return (
    <button
      type="button"
      onClick={() => onOpen(post.id)}
      title={`${time ? `${time} · ` : ""}${post.targets.map((t) => t.name).join(", ")}\n${post.caption}`}
      className="block w-full overflow-hidden rounded-lg border border-line bg-chip text-left transition hover:border-accent"
    >
      <div className="relative h-[4.4rem]">
        {post.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.thumbnail}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : null}
        {/* The scrim is what keeps white text legible on somebody's bright
            thumbnail; without a thumbnail it is the card's own background. */}
        <div
          className={cx(
            "absolute inset-0",
            post.thumbnail
              ? "bg-gradient-to-t from-black/75 via-black/25 to-black/35"
              : "bg-chip",
          )}
        />
        <span
          className={cx(
            "absolute top-1 right-1.5 rounded px-1 text-[10px] font-semibold whitespace-nowrap",
            post.thumbnail ? "text-white" : "text-muted",
          )}
        >
          {time}
        </span>
        <span
          aria-hidden
          className={`absolute top-1.5 left-1.5 h-1.5 w-1.5 rounded-full ${STATUS_DOT[post.status] ?? "bg-faint"}`}
        />
        <span
          className={cx(
            "absolute bottom-[18px] left-1.5 flex items-center gap-1",
            post.thumbnail ? "text-white" : "text-muted",
          )}
        >
          {platforms.slice(0, 4).map((platform) => (
            <PlatformIcon
              key={platform}
              platform={platform}
              className="h-3 w-3 rounded-[3px]"
            />
          ))}
          {platforms.length > 4 ? (
            <span className="text-[9px]">+{platforms.length - 4}</span>
          ) : null}
        </span>
        <p
          className={cx(
            "absolute right-1.5 bottom-1 left-1.5 truncate text-[10.5px]",
            post.thumbnail ? "text-white" : "text-ink",
          )}
        >
          {post.caption || "No caption"}
        </p>
      </div>
    </button>
  );
}

/** The month view's row: the same information at a tenth of the height. */
function PostChip({
  post,
  mounted,
  onOpen,
}: {
  post: CalendarPost;
  mounted: boolean;
  onOpen: (id: string) => void;
}) {
  const time = localTime(new Date(post.at), mounted);
  const platforms = [
    ...new Set(
      post.targets
        .map((target) => target.platform)
        .filter((platform): platform is Platform => Boolean(platform)),
    ),
  ];

  // Two lines rather than one: the time and where it goes are the scanning
  // information and belong on their own row, and cramming them in front of the
  // caption left about four words of it visible.
  return (
    <button
      type="button"
      onClick={() => onOpen(post.id)}
      title={`${time ? `${time} · ` : ""}${post.caption}`}
      className="block w-full overflow-hidden rounded-lg bg-bg px-[7px] py-[5px] text-left transition-[background] duration-150 hover:bg-chip"
    >
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden
          className={`h-[5px] w-[5px] shrink-0 rounded-full ${STATUS_DOT[post.status] ?? "bg-faint"}`}
        />
        {time ? (
          <span className="text-[11px] font-semibold whitespace-nowrap text-muted">
            {time}
          </span>
        ) : null}
        <span className="ml-auto flex items-center gap-0.5 text-faint">
          {platforms.slice(0, 3).map((platform) => (
            <PlatformIcon
              key={platform}
              platform={platform}
              className="h-2.5 w-2.5 rounded-[2px]"
            />
          ))}
          {platforms.length > 3 ? (
            <span className="text-[9.5px]">+{platforms.length - 3}</span>
          ) : null}
        </span>
      </span>
      <span className="mt-px block truncate text-[11.5px] text-ink">
        {post.caption || "No caption"}
      </span>
    </button>
  );
}

/** Everything the old Posts list did, on the post itself: what happened per
 *  platform, why a failure failed, and the two things you can still do to a
 *  post that has not gone out yet. */
function PostDetail({
  post,
  onClose,
  mounted,
}: {
  post: CalendarPost;
  onClose: () => void;
  mounted: boolean;
}) {
  const at = new Date(post.at);
  const failures = post.targets.filter((target) => target.outcome === "failed");

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 shell:items-center shell:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Post"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-line bg-panel p-6 shell:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span
              className={cx(
                "inline-block rounded-full px-2 py-[3px] text-[11px] font-semibold capitalize",
                STATUS_PILL[post.status] ?? "bg-chip text-muted",
              )}
            >
              {post.status}
            </span>
            <p className="mt-2.5 text-[15px]/[23px] text-pretty text-ink">
              {post.caption.trim() || (
                <span className="text-faint italic">(no caption)</span>
              )}
            </p>
            <p className="mt-1.5 text-[13px] text-faint">
              {post.status === "published" || post.status === "partial"
                ? "Published"
                : post.status === "draft"
                  ? "Pencilled in for"
                  : "Scheduled for"}{" "}
              {mounted ? at.toLocaleString() : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg px-2 py-1 text-muted transition hover:bg-chip hover:text-ink"
          >
            ✕
          </button>
        </div>

        {post.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.thumbnail}
            alt=""
            className="mt-3 max-h-52 w-full rounded-[12px] object-cover"
          />
        ) : null}

        {/* One row per target, dotted by that target's own result: the whole
            point of a partial is knowing which one. */}
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {post.targets.map((target) => {
            const dot =
              target.outcome === "published"
                ? "bg-ok"
                : target.outcome === "failed"
                  ? "bg-danger"
                  : post.status === "scheduled"
                    ? "bg-sky"
                    : "bg-faint";
            const label = target.platform
              ? `${PLATFORM_LABELS[target.platform]} · ${target.name}`
              : target.name;
            return (
              <li key={target.connectionId}>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-chip px-2.5 py-1 text-[11px] font-medium text-muted">
                  <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                  {target.url ? (
                    <a
                      href={target.url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline-offset-2 hover:underline"
                    >
                      {label}
                    </a>
                  ) : (
                    label
                  )}
                </span>
              </li>
            );
          })}
        </ul>

        {failures.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-1 rounded-lg bg-danger-soft px-3 py-2 text-[12px]/[17px] text-danger">
            {failures.map((target) => (
              <li key={target.connectionId}>
                {target.platform ? `${PLATFORM_LABELS[target.platform]} · ` : ""}
                {target.name}: {target.error}
              </li>
            ))}
          </ul>
        ) : post.lastError ? (
          <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-[12px]/[17px] text-danger">
            {post.lastError}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {post.status === "draft" ? (
            <ButtonLink href={`/dashboard/new-post?draft=${post.id}`} tone="primary" size="sm">
              Edit draft
            </ButtonLink>
          ) : null}

          {post.status === "scheduled" ? (
            <>
              <form action={cancelPostAction}>
                <input type="hidden" name="post_id" value={post.id} />
                <Button type="submit" tone="secondary" size="sm">
                  Cancel
                </Button>
              </form>
              {/* A <details> rather than a second dialog: this is one field
                  and a button. */}
              <details className="relative">
                <summary className="cursor-pointer list-none rounded-lg border border-line px-[13px] py-2 text-xs font-medium text-muted transition hover:border-line-strong hover:text-ink">
                  Edit time
                </summary>
                <form
                  action={reschedulePostAction}
                  className="mt-2 flex flex-wrap items-center gap-2"
                >
                  <input type="hidden" name="post_id" value={post.id} />
                  <input
                    type="datetime-local"
                    name="scheduled_for"
                    required
                    aria-label="New time"
                    className="rounded-[10px] border border-line bg-chip px-3 py-2 text-xs text-ink outline-none focus:border-accent"
                  />
                  <Button type="submit" tone="primary" size="sm">
                    Move it
                  </Button>
                </form>
              </details>
            </>
          ) : null}

          <Link
            href="/dashboard/new-post"
            className="ml-auto text-[12px] text-muted underline-offset-2 hover:text-ink hover:underline"
          >
            New post
          </Link>
        </div>
      </div>
    </div>
  );
}
