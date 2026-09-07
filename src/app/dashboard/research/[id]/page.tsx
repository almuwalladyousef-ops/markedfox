import type { Metadata } from "next";

import Link from "next/link";
import { notFound } from "next/navigation";

import { Icon } from "@/components/icons";
import { Markdown } from "@/components/markdown";
import {
  Card,
  CardTitle,
  MetricPills,
  Notice,
  Page,
  Pill,
  TwoPane,
  cx,
  formatCount,
  iconButtonClass,
} from "@/components/ui";
import { LocalTime } from "@/components/local-time";
import { requireUser } from "@/lib/auth/session";
import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import { exportAnalysis } from "@/lib/research/export";
import { parseFeedQuery, type FeedQuery } from "@/lib/research/feed-query";
import { configuredModel } from "@/lib/research/generate";
import { usableTranscript } from "@/lib/research/transcribe";
import { describeScore } from "@/lib/research/outlier";
import { getResearchProvider } from "@/lib/research/providers";
import {
  getBreakdown,
  getSource,
  getTranscript,
  getVideo,
  listProjects,
  listScripts,
  neighborVideos,
  toBreakdown,
} from "@/lib/research/store";
import {
  getIdeaForVideo,
  hasHookForVideo,
} from "@/lib/research/studio-store";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/store";

import { ActionStack } from "./action-stack";
import { AnalysisTabs } from "./analysis-tabs";
import { AnalyzeButton } from "./analyze-button";
import { BreakdownPanel } from "./breakdown-panel";
import { GeneratePanel } from "./generate-panel";
import { VideoPlayer } from "./video-player";

export const metadata: Metadata = { title: "Video · MarkedFox" };

// One outlier, everything known about it, and every way to turn it into work.

export default async function ResearchVideoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<FeedQuery>;
}) {
  const { id } = await params;
  // Carried from the feed card's link. Prev/next has to walk the list the user
  // was looking at — arriving from a keyword-filtered, recency-sorted feed and
  // landing on an unrelated video is worse than having no arrows.
  const query = await searchParams;
  const user = await requireUser();
  const active = await getActiveWorkspace();
  if (!active) notFound();

  const supabase = await createClient();
  // RLS scopes this: another tenant's video id simply returns nothing.
  const video = await getVideo(supabase, id);
  if (!video) notFound();

  const [
    source,
    transcript,
    snapshot,
    scripts,
    breakdownRow,
    projects,
    idea,
    hookSaved,
    neighbors,
  ] = await Promise.all([
    getSource(supabase, video.source_id),
    getTranscript(supabase, id),
    getEntitlementSnapshot(supabase, user.id, active.id),
    listScripts(supabase, active.id, 10),
    getBreakdown(supabase, id),
    listProjects(supabase, active.id),
    getIdeaForVideo(supabase, active.id, id),
    hasHookForVideo(supabase, active.id, id),
    neighborVideos(supabase, active.id, id, parseFeedQuery(query).filters),
  ]);

  const allowed = canUserDo(snapshot, { type: "use_research" });
  if (!allowed.allowed) notFound();

  const breakdown = breakdownRow ? toBreakdown(breakdownRow) : null;
  const provider = source ? getResearchProvider(source.platform) : null;
  const transcriptsPossible = Boolean(provider?.capabilities.transcripts);
  const creditsLeft = Math.max(
    0,
    snapshot.limits.researchCreditsPerMonth -
      snapshot.usage.researchCreditsThisMonth,
  );
  const forThisVideo = scripts.filter((s) => s.video_id === id);
  const score =
    video.outlier_score === null ? null : Number(video.outlier_score);

  const transcriptText = usableTranscript(transcript);
  // Said BEFORE the button is pressed, not discovered afterwards. Everything
  // here is about the video or the platform — never about our configuration,
  // which is not the customer's problem to read about.
  const transcriptNote = transcriptText
    ? null
    : transcript?.origin === "none"
      ? "There are no words to pull from this one — the analysis works from the title, the description and how it performed."
      : !transcriptsPossible
        ? `${PLATFORM_WORDS[source?.platform ?? ""] ?? "This platform"} gives no way to read what was said, so the analysis works from the title, the description and how it performed.`
        : null;

  return (
    <Page width="max-w-[1160px]">
      <Link
        href="/dashboard/research"
        className="text-[13.5px] font-medium text-faint transition-colors hover:text-ink"
      >
        ← Videos
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[22px]/[29px] font-bold tracking-[-0.02em]">
            {video.title}
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-muted">
            <span>
              {source?.handle ? `@${source.handle}` : (source?.title ?? "Unknown channel")}
            </span>
            <span className="text-faint">·</span>
            <span className="uppercase">{source?.platform}</span>
            {video.published_at ? (
              <>
                <span className="text-faint">·</span>
                <span><LocalTime value={video.published_at} mode="date" /></span>
              </>
            ) : null}
          </p>
        </div>

        {/* Paging through analyses is how a feed actually gets worked: open the
            best one, read it, press next. */}
        <div className="flex shrink-0 items-center gap-1.5">
          {neighbors.total > 0 ? (
            <span className="mr-1 text-[13px] text-faint">
              {neighbors.index} of {neighbors.total}
              {neighbors.truncated ? "+" : ""}
            </span>
          ) : null}
          <NeighborLink href={neighbors.previous} label="←" query={query} />
          <NeighborLink href={neighbors.next} label="→" query={query} />
        </div>
      </div>

      {/* Before it is analysed this page is three things: the video, its
          numbers, and one button. It used to render five panels of empty
          affordances — tabs with nothing in them, a generator warning that it
          had no breakdown to work from, a free "fetch transcript" step nobody
          pressed. All of it was scaffolding for work that had not happened,
          and it made a video look like a form to fill in. */}
      {breakdown ? (
        <TwoPane>
          <div className="flex min-w-[250px] flex-[0_1_288px] flex-col gap-4">
            <VideoPlayer
              platform={source?.platform ?? "unknown"}
              url={video.url}
              thumbnailUrl={video.thumbnail_url}
              title={video.title}
            />

            <Card>
              <Numbers
                score={score}
                video={video}
                platform={source?.platform ?? null}
                baselineSample={source?.baseline_sample ?? 0}
              />
            </Card>

            <ActionStack
              videoId={id}
              videoUrl={video.url}
              breakdown={breakdown}
              transcript={transcriptText}
              projects={projects.map((p) => ({ id: p.id, name: p.name }))}
              hookSaved={hookSaved}
              shortlisted={idea?.status === "shortlisted"}
              exportText={exportAnalysis({
                title: video.title,
                url: video.url,
                channel: source?.title ?? "Unknown channel",
                platform: source?.platform ?? "unknown",
                score,
                baselineViews: video.baseline_views,
                views: video.view_count,
                breakdown,
                transcript: transcriptText,
              })}
            />
          </div>

          <div className="flex min-w-[min(100%,440px)] flex-[1_1_480px] flex-col gap-4">
            {breakdown.summary ? (
              <Card>
                <CardTitle>Summary</CardTitle>
                <p className="mt-2 text-[14px]/[21px] text-muted">
                  {breakdown.summary}
                </p>
              </Card>
            ) : null}

            <AnalysisTabs
              breakdown={breakdown}
              transcript={transcriptText}
              transcriptNote={transcriptNote}
            />

            <BreakdownPanel
              videoId={id}
              breakdown={breakdown}
              enabled={configuredModel() !== null}
              creditsLeft={creditsLeft}
              hasTranscript={transcriptText !== null}
            />

            <GeneratePanel
              videoId={id}
              enabled={configuredModel() !== null}
              creditsLeft={creditsLeft}
              hasBreakdown
            />

            {idea && idea.status === "discarded" ? (
              <Notice tone="neutral">
                This one was discarded from the idea inbox. Shortlisting it puts
                it back.
              </Notice>
            ) : null}

            {forThisVideo.length > 0 ? (
              <section>
                <h2 className="text-[14.5px] font-semibold">
                  Generated from this video
                </h2>
                <ul className="mt-3 flex flex-col gap-3">
                  {forThisVideo.map((script) => (
                    <li
                      key={script.id}
                      className="rounded-lg border border-line bg-panel p-4"
                    >
                      <p className="flex items-center gap-2 text-[13px] text-faint">
                        <Pill>{script.kind}</Pill>
                        {script.topic ? script.topic : null}
                        <span className="ml-auto">
                          <LocalTime value={script.created_at} mode="date" />
                        </span>
                      </p>
                      {/* The model answers in markdown, so a heading used to
                          arrive as "## Hook" and a bolded beat with its
                          asterisks showing. */}
                      <Markdown className="mt-2">{script.output}</Markdown>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </TwoPane>
      ) : (
        <div className="mx-auto flex w-full max-w-[520px] flex-col gap-5 py-2">
          <VideoPlayer
            platform={source?.platform ?? "unknown"}
            url={video.url}
            thumbnailUrl={video.thumbnail_url}
            title={video.title}
          />

          <Card>
            <Numbers
              score={score}
              video={video}
              platform={source?.platform ?? null}
              baselineSample={source?.baseline_sample ?? 0}
            />
          </Card>

          <AnalyzeButton
            videoId={id}
            enabled={configuredModel() !== null}
            creditsLeft={creditsLeft}
            transcriptNote={transcriptNote}
          />
        </div>
      )}

    </Page>
  );
}

/** The same figures either side of the analysis. Extracted rather than
 *  duplicated: two copies of a metric block is how one of them ends up saying
 *  "views" on a platform that only reports likes. */
function Numbers({
  score,
  video,
  platform,
  baselineSample,
}: {
  score: number | null;
  video: { view_count: number | null; engagement_rate: unknown; baseline_views: number | null };
  platform: string | null;
  baselineSample: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      <MetricPills
        score={score === null ? null : `${score.toFixed(1)}x`}
        views={video.view_count}
        engagement={
          video.engagement_rate === null ? null : Number(video.engagement_rate)
        }
        viewsLabel={platform === "instagram" ? "likes" : "views"}
      />
      <p className="font-display text-[14px] font-bold text-ok">
        {describeScore(score, baselineSample)}
      </p>
      {video.baseline_views !== null ? (
        <p className="text-[13px] text-faint">
          This channel normally does {formatCount(video.baseline_views)}.
        </p>
      ) : null}
    </div>
  );
}

/** How a platform is named in a sentence to a customer. The registry keys are
 *  lowercase ids, and "instagram serves no transcripts" reads like a bug. */
const PLATFORM_WORDS: Record<string, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  tiktok: "TikTok",
  x: "X",
};

function NeighborLink({
  href,
  label,
  query,
}: {
  href: string | null;
  label: string;
  query: FeedQuery;
}) {
  if (!href) {
    return (
      <span
        className={cx(iconButtonClass, "cursor-default opacity-40")}
        aria-hidden
      >
        <Icon name={label === "←" ? "arrowLeft" : "arrowRight"} className="h-4 w-4" />
      </span>
    );
  }
  // The filters travel with the arrow, so the next video's arrows walk the
  // same list.
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      search.append(key, item);
    }
  }
  const suffix = search.toString();
  return (
    <Link
      href={`/dashboard/research/${href}${suffix ? `?${suffix}` : ""}`}
      aria-label={label === "←" ? "Previous video" : "Next video"}
      className={iconButtonClass}
    >
      <Icon name={label === "←" ? "arrowLeft" : "arrowRight"} className="h-4 w-4" />
    </Link>
  );
}
