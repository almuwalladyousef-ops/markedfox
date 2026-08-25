"use client";

import Link from "next/link";
import { useState } from "react";

import { Icon } from "@/components/icons";
import { Button, Eyebrow, cx, inputClass } from "@/components/ui";
import {
  FEED_DEFAULTS,
  SORT_LABELS,
  type ParsedFeedQuery,
} from "@/lib/research/feed-query";
import type { FeedSort } from "@/lib/research/store";

// The filter panel. A plain GET form: submitting it puts every control in the
// URL, which is what makes a filtered feed shareable and a saved filter a
// stored query string rather than a second schema.
//
// It is a client component for one reason — the channel list is a disclosure
// that would be unusable as forty always-open checkboxes.

export type ChannelOption = {
  id: string;
  title: string;
  handle: string | null;
  platform: string;
  followers: number | null;
};

export function FeedFilters({
  parsed,
  channels,
  savedCount,
}: {
  parsed: ParsedFeedQuery;
  channels: ChannelOption[];
  savedCount: number;
}) {
  const { form } = parsed;
  const [channelsOpen, setChannelsOpen] = useState(form.sources.length > 0);
  const [selected, setSelected] = useState<string[]>(form.sources);

  const selectedLabel =
    selected.length === 0
      ? "All channels"
      : selected.length === 1
        ? (channels.find((c) => c.id === selected[0])?.handle ??
          channels.find((c) => c.id === selected[0])?.title ??
          "1 channel")
        : `${selected.length} channels`;

  return (
    <form
      method="get"
      className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-4"
    >
      <div className="flex items-center justify-between">
        <Eyebrow>Filters</Eyebrow>
        {parsed.active ? (
          // A link rather than a reset button: reset would restore the values
          // the page loaded with, which is the opposite of what "Clear" means
          // once a filter is already applied.
          <Link
            href="/dashboard/research"
            className="text-[13px] font-semibold text-faint transition-colors hover:text-ink"
          >
            Clear
          </Link>
        ) : null}
      </div>

      <label className="block">
        <span className="text-[13px] font-semibold text-muted">Channels</span>
        <button
          type="button"
          onClick={() => setChannelsOpen((v) => !v)}
          className={cx(inputClass, "mt-2 flex items-center justify-between text-left")}
        >
          <span className="truncate">{selectedLabel}</span>
          <Icon
            name={channelsOpen ? "chevronUp" : "chevronDown"}
            className="h-3.5 w-3.5 text-faint"
          />
        </button>
      </label>

      {channelsOpen ? (
        <div className="-mt-2 max-h-64 overflow-y-auto rounded-lg border border-line">
          {channels.length === 0 ? (
            <p className="px-3 py-3 text-[13px] text-faint">
              No channels yet.
            </p>
          ) : (
            <ul>
              {channels.map((channel) => {
                const checked = selected.includes(channel.id);
                return (
                  <li key={channel.id}>
                    <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-[13.5px] text-ink transition-[background-color] duration-110 hover:bg-chip">
                      <input
                        type="checkbox"
                        name="source"
                        value={channel.id}
                        checked={checked}
                        onChange={(event) =>
                          setSelected((current) =>
                            event.target.checked
                              ? [...current, channel.id]
                              : current.filter((id) => id !== channel.id),
                          )
                        }
                        className="h-[15px] w-[15px] accent-[var(--accent)]"
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {channel.handle ? `@${channel.handle}` : channel.title}
                      </span>
                      <span className="shrink-0 text-[11px] text-faint uppercase">
                        {channel.platform}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        selected.map((id) => (
          <input key={id} type="hidden" name="source" value={id} />
        ))
      )}

      <label className="block">
        <span className="text-[13px] font-semibold text-muted">Keywords</span>
        <input
          name="q"
          defaultValue={form.keywords}
          placeholder="Search captions and titles"
          className={cx(inputClass, "mt-2")}
        />
      </label>

      {/* The max boxes are left empty rather than pre-filled with the default
          ceiling: a box reading 10,000,000 says videos above that are excluded,
          and they are not — the bound is only applied when it is set below the
          default. Empty and "any" is the truth. */}
      <Range
        label="Outlier score"
        minName="min_score"
        maxName="max_score"
        min={form.minScore}
        max={form.maxScore === FEED_DEFAULTS.maxScore ? null : form.maxScore}
        suffix="x"
        step={0.1}
      />
      <Range
        label="Views"
        minName="min_views"
        maxName="max_views"
        min={form.minViews}
        max={form.maxViews === FEED_DEFAULTS.maxViews ? null : form.maxViews}
        step={1000}
      />
      <Range
        label="Engagement"
        minName="min_eng"
        maxName="max_eng"
        min={form.minEngagement}
        max={
          form.maxEngagement === FEED_DEFAULTS.maxEngagement
            ? null
            : form.maxEngagement
        }
        suffix="%"
        step={1}
      />

      <label className="block">
        <span className="text-[13px] font-semibold text-muted">
          Posted in last
        </span>
        <div className="mt-1.5 flex gap-2">
          <input
            type="number"
            name="posted"
            min={0}
            defaultValue={form.postedWithin}
            className={`${inputClass} w-20`}
          />
          <select
            name="posted_unit"
            defaultValue={form.postedUnit}
            className={inputClass}
          >
            <option value="days">Days</option>
            <option value="months">Months</option>
          </select>
        </div>
      </label>

      <label className="block">
        <span className="text-[13px] font-semibold text-muted">Platform</span>
        <select
          name="platform"
          defaultValue={form.platform}
          className={cx(inputClass, "mt-2")}
        >
          <option value="">All platforms</option>
          <option value="youtube">YouTube</option>
          <option value="instagram">Instagram</option>
          <option value="tiktok">TikTok</option>
          <option value="x">X</option>
        </select>
      </label>

      <fieldset>
        <legend className="text-[13px] font-semibold text-muted">Status</legend>
        <div className="mt-2 flex flex-col gap-2 text-[14px]">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="status"
              value="analyzed"
              defaultChecked={form.analyzed}
              className="h-[15px] w-[15px] accent-[var(--accent)]"
            />
            Analyzed
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="status"
              value="unanalyzed"
              defaultChecked={form.unanalyzed}
              className="h-[15px] w-[15px] accent-[var(--accent)]"
            />
            Unanalyzed
          </label>
        </div>
      </fieldset>

      <label className="block">
        <span className="text-[13px] font-semibold text-muted">Sort by</span>
        <select
          name="sort"
          defaultValue={form.sort}
          className={cx(inputClass, "mt-2")}
        >
          {(Object.keys(SORT_LABELS) as FeedSort[]).map((key) => (
            <option key={key} value={key}>
              {SORT_LABELS[key]}
            </option>
          ))}
        </select>
      </label>

      <Button type="submit" tone="primary" size="sm">
        Apply
      </Button>

      {savedCount > 0 ? (
        <p className="text-[12.5px] text-faint">
          {savedCount} saved {savedCount === 1 ? "filter" : "filters"} above.
        </p>
      ) : null}
    </form>
  );
}

function Range({
  label,
  minName,
  maxName,
  min,
  max,
  suffix = "",
  step,
}: {
  label: string;
  minName: string;
  maxName: string;
  min: number;
  /** null renders an empty box reading "any" — there is no ceiling. */
  max: number | null;
  suffix?: string;
  step: number;
}) {
  return (
    <label className="block">
      <span className="text-[13px] font-semibold text-muted">{label}</span>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          type="number"
          name={minName}
          defaultValue={min}
          step={step}
          min={0}
          className={`${inputClass} w-full`}
        />
        <span className="text-[13px] text-faint">–</span>
        <div className="relative w-full">
          <input
            type="number"
            name={maxName}
            defaultValue={max ?? ""}
            placeholder="any"
            step={step}
            min={0}
            className={inputClass}
          />
          {suffix ? (
            <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[13px] text-faint">
              {suffix}
            </span>
          ) : null}
        </div>
      </div>
    </label>
  );
}

export { FEED_DEFAULTS };
