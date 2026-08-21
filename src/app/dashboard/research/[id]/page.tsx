import type { Metadata } from "next";

import Link from "next/link";
import { notFound } from "next/navigation";

import {
  Card,
  CardTitle,
  MetricPills,
  Notice,
  Page,
  Pill,
  formatCount,
} from "@/components/ui";
import { LocalTime } from "@/components/local-time";
import { requireUser } from "@/lib/auth/session";
import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import { fetchTranscriptAction } from "@/lib/research/actions";
import { exportAnalysis } from "@/lib/research/export";
import { parseFeedQuery, type FeedQuery } from "@/lib/research/feed-query";
import { configuredModel } from "@/lib/research/generate";
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
import { BreakdownPanel } from "./breakdown-panel";
import { GeneratePanel } from "./generate-panel";

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

  const transcriptText =
    transcript?.origin === "captions" ? transcript.text : null;
  const transcriptNote =
    transcript?.origin === "unavailable"
      ? "This video has no captions to pull. The breakdown still works from the title, description, and how it performed."
      : !transcriptsPossible
        ? `${source?.platform ?? "This platform"} serves no transcripts through its API.`
        : "No transcript pulled yet.";

  return (
    <Page width="max-w-[1160px]">
      <Link
        href="/dashboard/research"
        className="text-[12.5px] font-medium text-faint transition hover:text-ink"
      >
        ← Videos
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[22px]/[29px] font-bold tracking-[-0.02em]">
            {video.title}
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
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
            <span className="mr-1 text-xs text-faint">
              {neighbors.index} of {neighbors.total}
              {neighbors.truncated ? "+" : ""}
            </span>
          ) : null}
          <NeighborLink href={neighbors.previous} label="←" query={query} />
          <NeighborLink href={neighbors.next} label="→" query={query} />
        </div>
      </div>

      <div className="grid items-start gap-4 wide:grid-cols-[320px_1fr]">
        <div className="flex flex-col gap-4">
          <Card className="overflow-hidden p-0">
            <div className="relative aspect-[9/16] w-full bg-chip">
              {video.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={video.thumbnail_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : null}
              <a
                href={video.url}
                target="_blank"
                rel="noreferrer noopener"
                className="absolute inset-0 flex items-center justify-center bg-black/30 text-3xl text-white/80 opacity-0 transition hover:opacity-100"
                aria-label="Play on the platform"
              >
                ▶
              </a>
            </div>
            <div className="flex flex-col gap-2 p-3">
              <MetricPills
                score={score === null ? null : `${score.toFixed(1)}x`}
                views={video.view_count}
                engagement={
                  video.engagement_rate === null
                    ? null
                    : Number(video.engagement_rate)
                }
                viewsLabel={
                  source?.platform === "instagram" ? "likes" : "views"
                }
              />
              <p className="font-display text-[13px] font-bold text-ok">
                {describeScore(score, source?.baseline_sample ?? 0)}
              </p>
              {video.baseline_views !== null ? (
                <p className="text-xs text-faint">
                  This channel normally does {formatCount(video.baseline_views)}.
                </p>
              ) : null}
            </div>
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

          {!transcriptText && transcriptsPossible && !transcript ? (
            <form action={fetchTranscriptAction}>
              <input type="hidden" name="video_id" value={id} />
              <button
                type="submit"
                className="w-full rounded-[10px] border border-line-strong bg-panel px-3 py-2 text-[13px] text-ink transition hover:border-accent hover:text-accent"
              >
                Fetch transcript
                <span className="ml-2 text-xs text-faint">Free</span>
              </button>
            </form>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-3.5">
          {breakdown?.summary ? (
            <Card>
              <CardTitle>Summary</CardTitle>
              <p className="mt-2 text-[13px]/[20px] text-muted">
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
            hasTranscript={transcript?.origin === "captions"}
          />

          <GeneratePanel
            videoId={id}
            enabled={configuredModel() !== null}
            creditsLeft={creditsLeft}
            hasBreakdown={breakdown !== null}
          />

          {idea && idea.status === "discarded" ? (
            <Notice tone="neutral">
              This one was discarded from the idea inbox. Shortlisting it puts it
              back.
            </Notice>
          ) : null}

          {forThisVideo.length > 0 ? (
            <section>
              <h2 className="text-sm font-semibold">Generated from this video</h2>
              <ul className="mt-3 flex flex-col gap-3">
                {forThisVideo.map((script) => (
                  <li
                    key={script.id}
                    className="rounded-xl border border-line bg-panel p-4"
                  >
                    <p className="flex items-center gap-2 text-xs text-faint">
                      <Pill>{script.kind}</Pill>
                      {script.topic ? script.topic : null}
                      <span className="ml-auto">
                        <LocalTime value={script.created_at} mode="date" />
                      </span>
                    </p>
                    <pre className="mt-2 font-sans text-sm leading-relaxed whitespace-pre-wrap text-ink">
                      {script.output}
                    </pre>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </Page>
  );
}

function NeighborLink({
  href,
  label,
  query,
}: {
  href: string | null;
  label: string;
  query: FeedQuery;
}) {
  const className =
    "rounded-lg border border-line px-2.5 py-1.5 text-sm transition";
  if (!href) {
    return (
      <span className={`${className} text-faint`} aria-hidden>
        {label}
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
      className={`${className} text-ink hover:border-line-strong hover:text-ink`}
    >
      {label}
    </Link>
  );
}
