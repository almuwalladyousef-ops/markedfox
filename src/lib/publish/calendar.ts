// The calendar's date arithmetic, kept pure so it can be tested without a
// browser and without a clock.
//
// Everything here works in the viewer's local time. That is the only sane
// choice for a scheduling calendar — somebody scheduling "Tuesday 9am" means
// 9am where they are — and it is why the range is computed from a Date rather
// than from an ISO string on the server.

export type CalendarView = "month" | "week" | "day";

export function parseView(raw: string | undefined): CalendarView {
  return raw === "month" || raw === "day" ? raw : "week";
}

/** Midnight at the start of this date, locally. */
export function startOfDay(date: Date): Date {
  const out = new Date(date);
  out.setHours(0, 0, 0, 0);
  return out;
}

/** Sunday-first, matching the day headers the grid renders. */
export function startOfWeek(date: Date): Date {
  const out = startOfDay(date);
  out.setDate(out.getDate() - out.getDay());
  return out;
}

export function addDays(date: Date, days: number): Date {
  const out = new Date(date);
  out.setDate(out.getDate() + days);
  return out;
}

export function addMonths(date: Date, months: number): Date {
  const out = new Date(date);
  // Pin to the 1st before shifting: adding a month to the 31st otherwise
  // lands in the month after next, which makes the ‹ › buttons skip one.
  out.setDate(1);
  out.setMonth(out.getMonth() + months);
  return out;
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * The half-open range a view covers, and the days it draws.
 *
 * The month view starts on the Sunday before the 1st and runs whole weeks, so
 * the grid is always rectangular — a month view that changes height as you page
 * through the year is worse than a few greyed-out days.
 */
export function rangeFor(
  view: CalendarView,
  anchor: Date,
): { start: Date; end: Date; days: Date[] } {
  if (view === "day") {
    const start = startOfDay(anchor);
    return { start, end: addDays(start, 1), days: [start] };
  }
  if (view === "week") {
    const start = startOfWeek(anchor);
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    return { start, end: addDays(start, 7), days };
  }

  const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = startOfWeek(firstOfMonth);
  const lastOfMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const weeks = Math.ceil((lastOfMonth.getDate() + firstOfMonth.getDay()) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
  return { start, end: addDays(start, weeks * 7), days };
}

/** Where the ‹ and › buttons go from here. */
export function shift(view: CalendarView, anchor: Date, direction: -1 | 1): Date {
  if (view === "day") return addDays(anchor, direction);
  if (view === "week") return addDays(anchor, direction * 7);
  return addMonths(anchor, direction);
}

/** The heading above the grid. */
export function rangeLabel(view: CalendarView, anchor: Date): string {
  if (view === "day") {
    return anchor.toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }
  if (view === "month") {
    return anchor.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
  }
  const start = startOfWeek(anchor);
  const end = addDays(start, 6);
  const sameMonth = start.getMonth() === end.getMonth();
  return sameMonth
    ? `${start.toLocaleDateString(undefined, { month: "long" })} ${start.getDate()}–${end.getDate()}, ${end.getFullYear()}`
    : `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${end.getFullYear()}`;
}

/** "YYYY-MM-DD", for putting the anchor in the URL without a timezone. */
export function toDateParam(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromDateParam(raw: string | undefined, fallback: Date): Date {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fallback;
  const [year, month, day] = raw.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

/** The month the anchor falls in, split so the toolbar can weight the month
 *  and the year differently — "August" reads as the heading, "2026" as the
 *  qualifier, which is how every calendar app people already use shows it. */
export function monthYearParts(anchor: Date): { month: string; year: string } {
  return {
    month: anchor.toLocaleDateString(undefined, { month: "long" }),
    year: String(anchor.getFullYear()),
  };
}
