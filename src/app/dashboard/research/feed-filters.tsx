"use client";

import Link from "next/link";
import { useState } from "react";

import { Button, inputClass } from "@/components/ui";
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
      className="flex flex-col gap-4 rounded-xl border border-neutral-800 bg-neutral-950/60 p-4"
    >
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold tracking-widest text-neutral-500 uppercase">
          Filters
        </p>
        {parsed.active ? (
          // A link rather than a reset button: reset would restore the values
          // the page loaded with, which is the opposite of what "Clear" means
          // once a filter is already applied.
          <Link
            href="/dashboard/research"
            className="text-xs text-neutral-500 transition hover:text-neutral-300"
          >
            Clear
          </Link>
        ) : null}
      </div>

      <label className="block">
        <span className="text-xs font-medium text-neutral-400">Channels</span>
        <button
          type="button"
          onClick={() => setChannelsOpen((v) => !v)}
          className={`${inputClass} mt-1.5 flex items-center justify-between text-left`}
        >
          <span className="truncate">{selectedLabel}</span>
          <span className="text-neutral-500">{channelsOpen ? "▴" : "▾"}</span>
        </button>
      </label>

      {channelsOpen ? (
        <div className="-mt-2 max-h-64 overflow-y-auto rounded-lg border border-neutral-800">
          {channels.length === 0 ? (
            <p className="px-3 py-3 text-xs text-neutral-500">
              No channels yet.
            </p>
          ) : (
            <ul>
              {channels.map((channel) => {
                const checked = selected.includes(channel.id);
                return (
                  <li key={channel.id}>
                    <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition hover:bg-neutral-900">
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
                        className="accent-neutral-200"
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {channel.handle ? `@${channel.handle}` : channel.title}
                      </span>
                      <span className="shrink-0 text-[10px] text-neutral-600 uppercase">
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
        <span className="text-xs font-medium text-neutral-400">Keywords</span>
        <input
          name="q"
          defaultValue={form.keywords}
          placeholder="Search captions and titles"
          className={`${inputClass} mt-1.5`}
        />
      </label>

      <Range
        label="Outlier score"
        minName="min_score"
        maxName="max_score"
        min={form.minScore}
        max={form.maxScore}
        suffix="x"
        step={0.1}
      />
      <Range
        label="Views"
        minName="min_views"
        maxName="max_views"
        min={form.minViews}
        max={form.maxViews}
        step={1000}
      />
      <Range
        label="Engagement"
        minName="min_eng"
        maxName="max_eng"
        min={form.minEngagement}
        max={form.maxEngagement}
        suffix="%"
        step={1}
      />

      <label className="block">
        <span className="text-xs font-medium text-neutral-400">
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
        <span className="text-xs font-medium text-neutral-400">Platform</span>
        <select
          name="platform"
          defaultValue={form.platform}
          className={`${inputClass} mt-1.5`}
        >
          <option value="">All platforms</option>
          <option value="youtube">YouTube</option>
          <option value="instagram">Instagram</option>
          <option value="tiktok">TikTok</option>
          <option value="x">X</option>
        </select>
      </label>

      <fieldset>
        <legend className="text-xs font-medium text-neutral-400">Status</legend>
        <div className="mt-1.5 flex flex-col gap-1.5 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="status"
              value="analyzed"
              defaultChecked={form.analyzed}
              className="accent-neutral-200"
            />
            Analyzed
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="status"
              value="unanalyzed"
              defaultChecked={form.unanalyzed}
              className="accent-neutral-200"
            />
            Unanalyzed
          </label>
        </div>
      </fieldset>

      <label className="block">
        <span className="text-xs font-medium text-neutral-400">Sort by</span>
        <select
          name="sort"
          defaultValue={form.sort}
          className={`${inputClass} mt-1.5`}
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
        <p className="text-[11px] text-neutral-600">
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
  max: number;
  suffix?: string;
  step: number;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-neutral-400">{label}</span>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          type="number"
          name={minName}
          defaultValue={min}
          step={step}
          min={0}
          className={`${inputClass} w-full`}
        />
        <span className="text-xs text-neutral-600">–</span>
        <div className="relative w-full">
          <input
            type="number"
            name={maxName}
            defaultValue={max}
            step={step}
            min={0}
            className={inputClass}
          />
          {suffix ? (
            <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-neutral-600">
              {suffix}
            </span>
          ) : null}
        </div>
      </div>
    </label>
  );
}

export { FEED_DEFAULTS };
