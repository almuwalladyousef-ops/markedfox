"use client";

import { useActionState, useState } from "react";

import { Icon } from "@/components/icons";
import { PlatformTile } from "@/components/platform-icon";
import {
  Button,
  Eyebrow,
  Kbd,
  Notice,
  Pill,
  cx,
  formatCount,
  segmentedItem,
  segmentedTrack,
} from "@/components/ui";
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
      <div className={`${segmentedTrack} w-fit`}>
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            aria-pressed={tab === item.id}
            className={segmentedItem(tab === item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <form
        action={action}
        className="rounded-2xl border border-line bg-panel px-5 py-4"
      >
        <input type="hidden" name="platform" value={platform} />
        <input type="hidden" name="mode" value={tab === "suggest" ? "suggest" : "describe"} />
        {sizes.map((size) => (
          <input key={size} type="hidden" name="size" value={size} />
        ))}

        {tab === "suggest" ? (
          <p className="py-2 text-[14.5px]/[22px] text-pretty text-muted">
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
            className="w-full resize-y border-0 bg-transparent px-0 py-2 font-mono text-[14px]/[22px] text-ink outline-none placeholder:text-faint"
          />
        ) : (
          /* Borderless: this is the one thing the card is asking for, and a
             box drawn round it only competes with the platform buttons. */
          <input
            name="query"
            defaultValue={state.query}
            placeholder={PLACEHOLDER[tab]}
            className="w-full border-0 bg-transparent px-0 py-2 text-[16px] text-ink outline-none placeholder:text-faint"
          />
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {/* Buttons wearing each platform's own mark rather than a select:
              there are four, this is the most-changed control on the card, and
              a dropdown hides three of them behind a click.

              Still selectable when this deployment cannot read the platform —
              the note under the card says what is missing, which is more use
              than a control nobody can press and nobody can ask about. */}
          {platforms.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setPlatform(item.id)}
              aria-pressed={platform === item.id}
              title={item.available ? item.label : `${item.label} — needs setup`}
              className={cx(
                "inline-flex items-center gap-2 rounded-[10px] border px-2.5 py-1.5 text-[13px] font-semibold transition-[background,border-color,color] duration-150",
                platform === item.id
                  ? "border-accent bg-accent-soft text-ink"
                  : "border-line text-muted hover:border-line-strong hover:text-ink",
              )}
            >
              <PlatformTile platform={item.id} size={18} />
              {item.label}
              {item.available ? null : <span className="text-faint">· setup</span>}
            </button>
          ))}

          <div className="relative">
            <button
              type="button"
              onClick={() => setSizeOpen((v) => !v)}
              className="inline-flex items-center gap-2 rounded-[10px] border border-line bg-chip px-2.5 py-1.5 text-[13px] font-semibold text-ink"
            >
              {sizes.length === 0
                ? "Account size"
                : `${sizes.length} size${sizes.length === 1 ? "" : "s"}`}
              <Icon name="chevronDown" className="h-3 w-3 text-faint" />
            </button>
            {sizeOpen ? (
              <div className="absolute z-20 mt-1.5 w-64 rounded-[14px] border border-line bg-panel p-1.5 shadow-panel">
                {SIZE_TIERS.map((tier) => (
                  <label
                    key={tier.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-[background] duration-150 hover:bg-chip"
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
                      className="h-[15px] w-[15px] accent-[var(--accent)]"
                    />
                    <span className="font-semibold text-ink">
                      {tier.label}
                    </span>
                    <span className="ml-auto text-faint">{tier.range}</span>
                  </label>
                ))}
              </div>
            ) : null}
          </div>

          {sizes.length > 0 ? (
            <button
              type="button"
              onClick={() => setSizes([])}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-faint transition-[color] duration-150 hover:text-ink"
            >
              <Icon name="close" className="h-3 w-3" />
              Clear filters
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
            {tab === "search" || tab === "describe" ? (
              <Kbd className="border-accent-ink/40 bg-transparent text-accent-ink">
                ↵
              </Kbd>
            ) : null}
          </Button>
        </div>

        {(tab === "suggest" || tab === "describe") && aiConfigured ? (
          <p className="mt-3 text-[12.5px] text-faint">
            Costs 1 credit. {creditsLeft} left this month.
          </p>
        ) : null}
        {(tab === "suggest" || tab === "describe") && !aiConfigured ? (
          <p className="mt-3 text-[12.5px] text-warn">
            Needs an AI key on this deployment. Search and Add URL work without
            one.
          </p>
        ) : null}
        {active && !active.available ? (
          <p className="mt-3 text-[12.5px]/[18px] text-pretty text-warn">
            {active.note}
          </p>
        ) : null}
      </form>

      {state.message ? (
        <Notice tone={state.ok ? "ok" : "warn"}>{state.message}</Notice>
      ) : null}

      {/* Keyed by position, not by the heading: the headings are model-written
          and it is free to repeat one. */}
      {state.groups?.map((group, index) => (
        <section key={`${index}-${group.group}`}>
          <Eyebrow>{group.group}</Eyebrow>
          <ul className="mt-2.5 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2.5">
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
                    className={cx(
                      "flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-[background,border-color] duration-150 disabled:opacity-50",
                      chosen
                        ? "border-accent bg-accent-soft"
                        : "border-line hover:border-line-strong",
                    )}
                  >
                    <Avatar url={channel.thumbnailUrl} platform={channel.platform} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold text-ink">
                        {channel.handle ? `@${channel.handle}` : channel.title}
                      </span>
                      <span className="block text-[12.5px] text-faint">
                        {formatCount(channel.followerCount)} followers
                      </span>
                    </span>
                    {channel.watching ? (
                      <Pill tone="ok">Watching</Pill>
                    ) : chosen ? (
                      <Icon
                        name="check"
                        className="h-4 w-4 text-accent"
                        strokeWidth={2.6}
                      />
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
          className="sticky bottom-4 flex items-center gap-3 rounded-2xl border border-line bg-panel px-4 py-3 shadow-panel"
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
          <p className="text-[14px] font-semibold">
            {pickedList.length} selected
            <button
              type="button"
              onClick={() => setPicked({})}
              className="ml-3 text-[13px] font-normal text-faint transition-[color] duration-150 hover:text-ink"
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
            {adding ? "Saving…" : "Save to watchlist"}
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
  platform: ResearchPlatform;
}) {
  return (
    <span className="relative block h-[38px] w-[38px] shrink-0">
      {url ? (
        /* Avatars come from four platforms' CDNs; see video-card.tsx for the
           same reasoning about next/image. */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          loading="lazy"
          className="h-[38px] w-[38px] rounded-full object-cover"
        />
      ) : (
        <span className="block h-[38px] w-[38px] rounded-full bg-chip" />
      )}
      <span className="absolute -right-1 -bottom-1">
        <PlatformTile
          platform={platform}
          size={16}
          radius={999}
          className="ring-2 ring-panel"
        />
      </span>
    </span>
  );
}
