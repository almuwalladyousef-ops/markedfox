import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/session";
import {
  Button,
  ButtonLink,
  EmptyState,
  Notice,
  PageHeader,
  Pill,
  UpgradeCard,
} from "@/components/ui";
import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import { parseFeedQuery, type FeedQuery } from "@/lib/research/feed-query";
import { configuredModel } from "@/lib/research/generate";
import { breakdownVideoIds, listFeed, listSources } from "@/lib/research/store";
import {
  deleteSavedFilterAction,
  saveFilterAction,
} from "@/lib/research/studio-actions";
import { listSavedFilters } from "@/lib/research/studio-store";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/store";

import { FeedFilters, type ChannelOption } from "./feed-filters";
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
      <>
        <PageHeader title="Videos" />
        <UpgradeCard title="Studio" reason={allowed.reason}>
          Watch any creator&rsquo;s channel and MarkedFox flags the videos that
          beat that channel&rsquo;s own average — the ones worth learning from.
          Pull the transcript, break down why it worked, then generate hooks, an
          outline, or a full script from the mechanism rather than the wording.
        </UpgradeCard>
      </>
    );
  }

  const parsed = parseFeedQuery(query);
  const [sources, feed, savedFilters] = await Promise.all([
    listSources(supabase, active.id),
    listFeed(supabase, active.id, parsed.filters),
    listSavedFilters(supabase, active.id),
  ]);

  // One query for the whole page rather than one per card.
  const analysed = await breakdownVideoIds(
    supabase,
    feed.map((v) => v.id),
  );

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
    <>
      <PageHeader
        title="Videos"
        subtitle="Analyze videos from your channels to unlock deep insights and find your next idea."
        actions={
          <>
            <Pill tone="neutral" title="Research credits left this month">
              {creditsLeft} / {snapshot.limits.researchCreditsPerMonth} credits
            </Pill>
            <ButtonLink href="/dashboard/research/channels" size="sm">
              Customize channels
            </ButtonLink>
            <ButtonLink href="/dashboard/research/tools" size="sm">
              Add video URL
            </ButtonLink>
          </>
        }
      />

      {!model ? (
        <Notice tone="warn">
          Channel tracking and outlier scoring work now. Breakdowns and script
          generation turn on once an AI key is configured on this deployment.
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
        <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
          <div className="flex flex-col gap-3">
            {savedFilters.length > 0 ? (
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-3">
                <p className="text-[10px] font-semibold tracking-widest text-neutral-500 uppercase">
                  Saved
                </p>
                <ul className="mt-2 flex flex-col gap-1">
                  {savedFilters.map((filter) => {
                    const params = new URLSearchParams();
                    for (const [key, value] of Object.entries(filter.filters)) {
                      params.append(key, String(value));
                    }
                    return (
                      <li
                        key={filter.id}
                        className="flex items-center justify-between gap-2"
                      >
                        <a
                          href={`/dashboard/research?${params.toString()}`}
                          className="min-w-0 flex-1 truncate text-sm text-neutral-300 hover:text-neutral-50"
                        >
                          {filter.name}
                        </a>
                        <form action={deleteSavedFilterAction}>
                          <input type="hidden" name="id" value={filter.id} />
                          <button
                            type="submit"
                            aria-label={`Delete ${filter.name}`}
                            className="px-1 text-neutral-600 transition hover:text-red-300"
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
                className="flex gap-2 rounded-xl border border-neutral-800 bg-neutral-950/60 p-3"
              >
                {/* The filter being saved is exactly the one on screen, carried
                    as hidden fields so the saved row is the current URL. */}
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
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs outline-none focus:border-neutral-600"
                />
                <Button type="submit" size="sm">
                  Save
                </Button>
              </form>
            ) : null}
          </div>

          <div>
            <p className="mb-3 text-xs text-neutral-500">
              {feed.length} {feed.length === 1 ? "video" : "videos"}
              {parsed.active ? " matching these filters" : ""}
              {feed.length === 120 ? " (showing the first 120)" : ""}
            </p>

            {feed.length === 0 ? (
              <EmptyState title="Nothing matches">
                {parsed.active
                  ? "Loosen a filter, or clear them all."
                  : "These channels have not been synced yet. Sync one from Channels, or wait for the next automatic refresh."}
              </EmptyState>
            ) : (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                {feed.map((video) => (
                  <VideoCard
                    key={video.id}
                    video={video}
                    analyzed={analysed.has(video.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
