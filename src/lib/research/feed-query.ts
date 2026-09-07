import type { FeedFilters, FeedSort } from "./store";

// The feed's filters live in the URL. Three reasons, in order: a filtered feed
// is a thing people send each other, saving a filter is then just storing the
// query string, and a server component can read it without any client state at
// all — the filter panel is a plain <form method="get">.

export type FeedQuery = Record<string, string | string[] | undefined>;

export const SORT_LABELS: Record<FeedSort, string> = {
  outlier: "Outlier score",
  views: "Views",
  engagement: "Engagement",
  recent: "Most recent",
};

/** Defaults chosen to show everything: a filter panel that hides rows on first
 *  load looks like an empty account. */
export const FEED_DEFAULTS = {
  minScore: 0,
  maxScore: 100,
  minViews: 0,
  maxViews: 10_000_000,
  minEngagement: 0,
  maxEngagement: 100,
  postedWithin: 0,
  postedUnit: "days" as "days" | "months",
  sort: "outlier" as FeedSort,
};

function one(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function many(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function number(
  value: string | string[] | undefined,
  fallback: number,
): number {
  const raw = one(value);
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export interface ParsedFeedQuery {
  /** What the form should render — always concrete, never undefined. */
  form: {
    keywords: string;
    sources: string[];
    platform: string;
    minScore: number;
    maxScore: number;
    minViews: number;
    maxViews: number;
    minEngagement: number;
    maxEngagement: number;
    postedWithin: number;
    postedUnit: "days" | "months";
    analyzed: boolean;
    unanalyzed: boolean;
    saved: boolean;
    sort: FeedSort;
  };
  /** What the store should run. Only non-default constraints appear. */
  filters: FeedFilters;
  /** True when anything differs from the defaults — drives "Clear". */
  active: boolean;
}

export function parseFeedQuery(query: FeedQuery): ParsedFeedQuery {
  const keywords = one(query.q)?.slice(0, 120) ?? "";
  const sources = many(query.source).slice(0, 50);
  const platform = one(query.platform) ?? "";
  const minScore = number(query.min_score, FEED_DEFAULTS.minScore);
  const maxScore = number(query.max_score, FEED_DEFAULTS.maxScore);
  const minViews = number(query.min_views, FEED_DEFAULTS.minViews);
  const maxViews = number(query.max_views, FEED_DEFAULTS.maxViews);
  const minEngagement = number(query.min_eng, FEED_DEFAULTS.minEngagement);
  const maxEngagement = number(query.max_eng, FEED_DEFAULTS.maxEngagement);
  const postedWithin = number(query.posted, FEED_DEFAULTS.postedWithin);
  const postedUnit = one(query.posted_unit) === "months" ? "months" : "days";
  const sortRaw = one(query.sort);
  const sort: FeedSort =
    sortRaw === "views" || sortRaw === "engagement" || sortRaw === "recent"
      ? sortRaw
      : "outlier";

  // Both boxes ticked is the same set as neither ticked, so both render checked
  // by default and only a genuine one-of-two choice becomes a filter.
  // Saved is its own switch rather than a third value in `status`, because it
  // is a different question: "have I looked at this" and "did I keep it" are
  // both true of the same video.
  const saved = one(query.saved) === "1";

  const analyzedRaw = many(query.status);
  const hasStatus = analyzedRaw.length > 0;
  const analyzed = hasStatus ? analyzedRaw.includes("analyzed") : true;
  const unanalyzed = hasStatus ? analyzedRaw.includes("unanalyzed") : true;

  const filters: FeedFilters = { sort, limit: 120 };
  if (keywords) filters.keywords = keywords;
  if (sources.length > 0) filters.sourceIds = sources;
  if (platform) filters.platform = platform as FeedFilters["platform"];
  if (minScore > FEED_DEFAULTS.minScore) filters.minScore = minScore;
  if (maxScore < FEED_DEFAULTS.maxScore) filters.maxScore = maxScore;
  if (minViews > FEED_DEFAULTS.minViews) filters.minViews = minViews;
  if (maxViews < FEED_DEFAULTS.maxViews) filters.maxViews = maxViews;
  if (minEngagement > FEED_DEFAULTS.minEngagement) {
    filters.minEngagement = minEngagement / 100;
  }
  if (maxEngagement < FEED_DEFAULTS.maxEngagement) {
    filters.maxEngagement = maxEngagement / 100;
  }
  if (postedWithin > 0) {
    filters.postedWithinDays =
      postedUnit === "months" ? postedWithin * 30 : postedWithin;
  }
  if (analyzed !== unanalyzed) filters.analyzed = analyzed;
  if (saved) filters.saved = true;

  const active =
    Object.keys(filters).length > 2 || sort !== FEED_DEFAULTS.sort;

  return {
    form: {
      keywords,
      sources,
      platform,
      minScore,
      maxScore,
      minViews,
      maxViews,
      minEngagement,
      maxEngagement,
      postedWithin,
      postedUnit,
      analyzed,
      unanalyzed,
      saved,
      sort,
    },
    filters,
    active,
  };
}
