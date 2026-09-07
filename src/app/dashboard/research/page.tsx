import type { Metadata } from "next";

import Link from "next/link";

import { requireUser } from "@/lib/auth/session";
import {
  Button,
  ButtonLink,
  EmptyState,
  Eyebrow,
  Notice,
  Page,
  PageHeader,
  Pill,
  UpgradeCard,
  segmentedItem,
  segmentedTrack,
} from "@/components/ui";
import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import {
  parseFeedQuery,
  SORT_LABELS,
  type FeedQuery,
} from "@/lib/research/feed-query";
import { configuredModel } from "@/lib/research/generate";
import {
  breakdownVideoIds,
  listFeed,
  listSources,
  type FeedSort,
} from "@/lib/research/store";
import {
  deleteSavedFilterAction,
  saveFilterAction,
} from "@/lib/research/studio-actions";
import { listSavedFilters, savedVideoIds } from "@/lib/research/studio-store";
import { savedFilterParams } from "@/lib/research/studio-types";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/store";

import { FeedFilters, type ChannelOption } from "./feed-filters";
import { FeedShell } from "./feed-shell";
import { VideoCard } from "./video-card";

export const metadata: Metadata = { title: "Videos · MarkedFox" };

// The research feed: every video from every watched channel, ranked by how far
// it beat its own channel's median rather than by raw views. A 40k video on a
// 3k-follower account outranks a 2M day on a 5M account here, which is the
// entire point and is the thing raw-view leaderboards get wrong.

export default async function ResearchPage({
  searchParams,
}: {
  searchParams: Promise<FeedQuery>;
}) {
  const query = await searchParams;
  const user = await requireUser();
  const active = await getActiveWorkspace();
  if (!active) return <Notice>No workspace is selected.</Notice>;

  const supabase = await createClient();
  const snapshot = await getEntitlementSnapshot(supabase, user.id, active.id);
  const allowed = canUserDo(snapshot, { type: "use_research" });

  if (!allowed.allowed) {
    return (
      <Page width="max-w-[1240px]">
        <PageHeader title="Videos" />
        <UpgradeCard title="Studio" reason={allowed.reason}>
          Watch any creator&rsquo;s channel and MarkedFox flags the videos that
          beat that channel&rsquo;s own average — the ones worth learning from.
          Pull the transcript, break down why it worked, then generate hooks, an
          outline, or a full script from the mechanism rather than the wording.
        </UpgradeCard>
      </Page>
    );
  }

  const parsed = parseFeedQuery(query);
  const [sources, feed, savedFilters] = await Promise.all([
    listSources(supabase, active.id),
    listFeed(supabase, active.id, parsed.filters),
    listSavedFilters(supabase, active.id),
  ]);

  // Two queries for the whole page rather than two per card.
  const videoIds = feed.map((v) => v.id);
  const [analysed, saved] = await Promise.all([
    breakdownVideoIds(supabase, videoIds),
    savedVideoIds(supabase, active.id, videoIds),
  ]);

  const channels: ChannelOption[] = sources.map((source) => ({
    id: source.id,
    title: source.title,
    handle: source.handle,
    platform: source.platform,
    followers: source.follower_count,
  }));

  const model = configuredModel();
  const creditsLeft = Math.max(
    0,
    snapshot.limits.researchCreditsPerMonth -
      snapshot.usage.researchCreditsThisMonth,
  );

  const currentQuery = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      currentQuery.append(key, item);
    }
  }

  return (
    <Page width="max-w-[1240px]">
      <PageHeader
        title="Videos"
        subtitle="Every video from every watched channel, ranked by how far it beat its own channel's average."
        actions={
          <>
            <Pill
              tone="neutral"
              className="text-xs"
              title="Research credits left this month"
            >
              {creditsLeft} / {snapshot.limits.researchCreditsPerMonth} credits
            </Pill>
          </>
        }
      />

      {!model ? (
        <Notice tone="warn">
          Channel tracking and outlier scoring work now. Breakdowns and script
          generation are not available yet.
        </Notice>
      ) : null}

      {sources.length === 0 ? (
        <EmptyState
          title="No channels yet"
          action={
            <ButtonLink href="/dashboard/research/channels" tone="primary">
              Pick channels
            </ButtonLink>
          }
        >
          Pick the creators worth studying in your niche. Their videos appear
          here within a minute, each scored against that channel&rsquo;s own
          average rather than against everyone else&rsquo;s.
        </EmptyState>
      ) : (
        <FeedShell
          active={parsed.active}
          left={
            <>
              <ButtonLink href="/dashboard/research/channels" size="xs">
                Customize channels
              </ButtonLink>
              <ButtonLink href="/dashboard/research/tools" size="xs">
                Add video URL
              </ButtonLink>
              <span className="text-[13px] text-faint">
                {feed.length} {feed.length === 1 ? "video" : "videos"}
                {parsed.active ? " matching" : ""}
                {feed.length === 120 ? " (first 120)" : ""}
              </span>
            </>
          }
          sort={
            /* Links, not a <select> with a Go button beside it.
               The old control needed the form submitted before it applied, so
               choosing an option did nothing visible — which reads as a broken
               control, not a two-step one, and nobody presses Go. Links also
               need no JavaScript to work at all, and each one is a URL you can
               share or bookmark. */
            /* Scrolls on a phone. Four options do not fit 390px, and without
               this the last one ("Most recent") is clipped by the toolbar and
               cannot be reached at all. */
            <div className="-mx-1 max-w-full overflow-x-auto px-1">
              <div className={segmentedTrack}>
              {(Object.keys(SORT_LABELS) as FeedSort[]).map((key) => {
                const next = new URLSearchParams(currentQuery);
                next.set("sort", key);
                return (
                  <Link
                    key={key}
                    href={`/dashboard/research?${next.toString()}`}
                    aria-current={parsed.form.sort === key ? "page" : undefined}
                    className={segmentedItem(
                      parsed.form.sort === key,
                      "px-3 py-1 text-[13px] whitespace-nowrap",
                    )}
                  >
                    {SORT_LABELS[key]}
                  </Link>
                );
              })}
              </div>
            </div>
          }
          rows={feed.map((video) => ({
            title: video.title,
            url: video.url,
            handle: video.source.handle,
            score: video.outlier_score === null ? null : Number(video.outlier_score),
            views: video.view_count,
          }))}
          panel={
            <div className="flex flex-col gap-3">
              {savedFilters.length > 0 ? (
                <div className="rounded-2xl border border-line bg-panel p-4">
                  <Eyebrow>Saved</Eyebrow>
                  <ul className="mt-2.5 flex flex-col gap-1.5">
                    {savedFilters.map((filter) => {
                      const params = savedFilterParams(filter.filters);
                      return (
                        <li
                          key={filter.id}
                          className="flex items-center justify-between gap-2"
                        >
                          <a
                            href={`/dashboard/research?${params.toString()}`}
                            className="min-w-0 flex-1 truncate text-[13.5px] text-muted transition-colors hover:text-ink"
                          >
                            {filter.name}
                          </a>
                          <form action={deleteSavedFilterAction}>
                            <input type="hidden" name="id" value={filter.id} />
                            <button
                              type="submit"
                              aria-label={`Delete ${filter.name}`}
                              className="px-1 text-faint transition-colors hover:text-danger"
                            >
                              ×
                            </button>
                          </form>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}

              <FeedFilters
                parsed={parsed}
                channels={channels}
                savedCount={savedFilters.length}
              />

              {parsed.active ? (
                <form
                  action={saveFilterAction}
                  className="flex gap-2 rounded-2xl border border-line bg-panel p-4"
                >
                  {/* The filter being saved is exactly the one on screen,
                      carried as hidden fields so the saved row is the current
                      URL. */}
                  {[...currentQuery.entries()].map(([key, value], index) => (
                    <input
                      key={`${key}-${index}`}
                      type="hidden"
                      name={key}
                      value={value}
                    />
                  ))}
                  <input
                    name="name"
                    required
                    maxLength={60}
                    placeholder="Save this filter as…"
                    className="w-full rounded-md border border-line bg-chip px-3 py-2 text-[13px] text-ink outline-none focus:border-accent"
                  />
                  <Button type="submit" size="xs">
                    Save
                  </Button>
                </form>
              ) : null}
            </div>
          }
        >
          {feed.length === 0 ? (
            <EmptyState title="Nothing matches">
              {parsed.active
                ? "Loosen a filter, or clear them all."
                : "These channels have not been synced yet. Sync one from Channels, or wait for the next automatic refresh."}
            </EmptyState>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(216px,1fr))] gap-3">
              {feed.map((video) => (
                <VideoCard
                  key={video.id}
                  video={video}
                  analyzed={analysed.has(video.id)}
                  saved={saved.has(video.id)}
                  query={currentQuery.toString()}
                />
              ))}
            </div>
          )}
        </FeedShell>
      )}
    </Page>
  );
}
