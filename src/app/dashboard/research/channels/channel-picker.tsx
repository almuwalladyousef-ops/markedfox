"use client";

import { useActionState, useState } from "react";

import { Button, Notice, Pill, formatCount, inputClass } from "@/components/ui";
import { SIZE_TIERS, type ChannelCandidate } from "@/lib/research/discover";
import {
  addChannelsAction,
  describeChannelsAction,
  parseChannelUrlsAction,
  searchChannelsAction,
  type DiscoverState,
  type StudioFormState,
} from "@/lib/research/studio-actions";
import type { ResearchPlatform } from "@/lib/research/types";

// Four ways to find channels, one list to put them in.
//
// The tabs are not four features — they are four answers to "I do not know who
// to watch", ordered by how much the user already knows: nothing (Suggested),
// a description (Describe), a name (Search), a list (Add URL).

const TABS = [
  { id: "suggest", label: "Suggested" },
  { id: "describe", label: "Describe" },
  { id: "search", label: "Search" },
  { id: "url", label: "Add URL" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const EMPTY: DiscoverState = {};
const EMPTY_ADD: StudioFormState = {};

const PLACEHOLDER: Record<TabId, string> = {
  suggest: "",
  describe: "e.g. short videos about marketing strategy for founders",
  search: "Channel name or handle",
  url: "Paste full channel URLs separated by newline or comma…",
};

export function ChannelPicker({
  platforms,
  defaultPlatform,
  creditsLeft,
  aiConfigured,
}: {
  platforms: { id: ResearchPlatform; label: string; note: string; available: boolean }[];
  defaultPlatform: ResearchPlatform;
  creditsLeft: number;
  aiConfigured: boolean;
}) {
  const [tab, setTab] = useState<TabId>("suggest");
  const [platform, setPlatform] = useState<ResearchPlatform>(defaultPlatform);
  const [sizes, setSizes] = useState<string[]>([]);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [picked, setPicked] = useState<Record<string, ChannelCandidate>>({});

  const [searchState, runSearch, searching] = useActionState(
    searchChannelsAction,
    EMPTY,
  );
  const [describeState, runDescribe, describing] = useActionState(
    describeChannelsAction,
    EMPTY,
  );
  const [urlState, runUrls, parsing] = useActionState(
    parseChannelUrlsAction,
    EMPTY,
  );
  const [addState, runAdd, adding] = useActionState(addChannelsAction, EMPTY_ADD);

  const state =
    tab === "search" ? searchState : tab === "url" ? urlState : describeState;
  const action =
    tab === "search" ? runSearch : tab === "url" ? runUrls : runDescribe;
  const pending =
    tab === "search" ? searching : tab === "url" ? parsing : describing;

  const active = platforms.find((p) => p.id === platform);
  const pickedList = Object.values(picked);

  function key(channel: ChannelCandidate): string {
    return `${channel.platform}:${channel.externalId}`;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1 rounded-lg bg-neutral-900/60 p-1">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-md px-3 py-1.5 text-sm transition ${
              tab === item.id
                ? "bg-neutral-800 font-medium text-neutral-50"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <form
        action={action}
        className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-3"
      >
        <input type="hidden" name="platform" value={platform} />
        <input type="hidden" name="mode" value={tab === "suggest" ? "suggest" : "describe"} />
        {sizes.map((size) => (
          <input key={size} type="hidden" name="size" value={size} />
        ))}

        {tab === "suggest" ? (
          <p className="px-1 py-2 text-sm text-neutral-400">
            Suggestions are built from the channels you already track, then
            checked against {active?.label ?? "the platform"} — anything that
            does not resolve to a real account is dropped before you see it.
          </p>
        ) : tab === "url" ? (
          <textarea
            name="query"
            rows={4}
            defaultValue={state.query}
            placeholder={PLACEHOLDER[tab]}
            className={`${inputClass} resize-y font-mono text-xs`}
          />
        ) : (
          <input
            name="query"
            defaultValue={state.query}
            placeholder={PLACEHOLDER[tab]}
            className={inputClass}
          />
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={platform}
            onChange={(event) =>
              setPlatform(event.target.value as ResearchPlatform)
            }
            className="rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs outline-none focus:border-neutral-600"
          >
            {platforms.map((item) => (
              <option key={item.id} value={item.id} disabled={!item.available}>
                {item.label}
                {item.available ? "" : " — not configured"}
              </option>
            ))}
          </select>

          <div className="relative">
            <button
              type="button"
              onClick={() => setSizeOpen((v) => !v)}
              className="rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-300"
            >
              {sizes.length === 0
                ? "Account size"
                : `${sizes.length} size${sizes.length === 1 ? "" : "s"}`}{" "}
              ▾
            </button>
            {sizeOpen ? (
              <div className="absolute z-20 mt-1 w-64 rounded-lg border border-neutral-800 bg-neutral-950 p-1 shadow-2xl">
                {SIZE_TIERS.map((tier) => (
                  <label
                    key={tier.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs transition hover:bg-neutral-900"
                  >
                    <input
                      type="checkbox"
                      checked={sizes.includes(tier.id)}
                      onChange={(event) =>
                        setSizes((current) =>
                          event.target.checked
                            ? [...current, tier.id]
                            : current.filter((id) => id !== tier.id),
                        )
                      }
                      className="accent-neutral-200"
                    />
                    <span className="font-medium text-neutral-200">
                      {tier.label}
                    </span>
                    <span className="ml-auto text-neutral-500">{tier.range}</span>
                  </label>
                ))}
              </div>
            ) : null}
          </div>

          {sizes.length > 0 ? (
            <button
              type="button"
              onClick={() => setSizes([])}
              className="text-xs text-neutral-500 transition hover:text-neutral-300"
            >
              ✕ Clear filters
            </button>
          ) : null}

          <Button
            type="submit"
            tone="primary"
            size="sm"
            disabled={pending}
            className="ml-auto"
          >
            {pending
              ? "Working…"
              : tab === "url"
                ? "Parse"
                : tab === "suggest"
                  ? "Suggest channels"
                  : "Search"}
          </Button>
        </div>

        {(tab === "suggest" || tab === "describe") && aiConfigured ? (
          <p className="mt-2 px-1 text-[11px] text-neutral-600">
            Costs 1 credit. {creditsLeft} left this month.
          </p>
        ) : null}
        {(tab === "suggest" || tab === "describe") && !aiConfigured ? (
          <p className="mt-2 px-1 text-[11px] text-amber-400">
            Needs an AI key on this deployment. Search and Add URL work without
            one.
          </p>
        ) : null}
        {active && !active.available ? (
          <p className="mt-2 px-1 text-[11px] text-amber-400">{active.note}</p>
        ) : null}
      </form>

      {state.message ? (
        <Notice tone={state.ok ? "ok" : "warn"}>{state.message}</Notice>
      ) : null}

      {/* Keyed by position, not by the heading: the headings are model-written
          and it is free to repeat one. */}
      {state.groups?.map((group, index) => (
        <section key={`${index}-${group.group}`}>
          <p className="text-[10px] font-semibold tracking-widest text-neutral-500 uppercase">
            {group.group}
          </p>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {group.channels.map((channel) => {
              const id = key(channel);
              const chosen = Boolean(picked[id]);
              return (
                <li key={id}>
                  <button
                    type="button"
                    disabled={channel.watching}
                    onClick={() =>
                      setPicked((current) => {
                        const next = { ...current };
                        if (next[id]) delete next[id];
                        else next[id] = channel;
                        return next;
                      })
                    }
                    className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition disabled:opacity-50 ${
                      chosen
                        ? "border-neutral-500 bg-neutral-900"
                        : "border-neutral-800 hover:border-neutral-600"
                    }`}
                  >
                    <Avatar url={channel.thumbnailUrl} platform={channel.platform} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {channel.handle ? `@${channel.handle}` : channel.title}
                      </span>
                      <span className="block text-xs text-neutral-500">
                        {formatCount(channel.followerCount)} followers
                      </span>
                    </span>
                    {channel.watching ? (
                      <Pill tone="ok">Watching</Pill>
                    ) : chosen ? (
                      <span className="text-sm text-neutral-200">✓</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {pickedList.length > 0 ? (
        <form
          action={runAdd}
          className="sticky bottom-4 flex items-center gap-3 rounded-xl border border-neutral-700 bg-neutral-900 p-3 shadow-2xl"
        >
          {/* JSON rather than a delimited string: "Alex Hormozi | Acquisition"
              is a perfectly ordinary channel name, and a pipe-joined value
              would shred it into a wrong title, a garbage thumbnail URL and a
              lost follower count. */}
          {pickedList.map((channel) => (
            <input
              key={key(channel)}
              type="hidden"
              name="channel"
              value={JSON.stringify({
                platform: channel.platform,
                externalId: channel.externalId,
                handle: channel.handle,
                title: channel.title,
                thumbnailUrl: channel.thumbnailUrl,
                followerCount: channel.followerCount,
              })}
            />
          ))}
          <p className="text-sm">
            {pickedList.length} selected
            <button
              type="button"
              onClick={() => setPicked({})}
              className="ml-3 text-xs text-neutral-500 transition hover:text-neutral-300"
            >
              Clear
            </button>
          </p>
          <Button
            type="submit"
            tone="primary"
            size="sm"
            disabled={adding}
            className="ml-auto"
          >
            {adding ? "Adding…" : "Add to watchlist"}
          </Button>
        </form>
      ) : null}

      {addState.message ? (
        <Notice tone={addState.ok ? "ok" : "warn"}>{addState.message}</Notice>
      ) : null}
    </div>
  );
}

function Avatar({
  url,
  platform,
}: {
  url: string | null;
  platform: string;
}) {
  return (
    <span className="relative block h-9 w-9 shrink-0">
      {url ? (
        /* Avatars come from four platforms' CDNs; see video-card.tsx for the
           same reasoning about next/image. */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          loading="lazy"
          className="h-9 w-9 rounded-full object-cover"
        />
      ) : (
        <span className="block h-9 w-9 rounded-full bg-neutral-800" />
      )}
      <span className="absolute -right-0.5 -bottom-0.5 rounded bg-neutral-950 px-1 text-[8px] font-bold text-neutral-400 uppercase">
        {platform.slice(0, 2)}
      </span>
    </span>
  );
}
