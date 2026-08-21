import Link from "next/link";

import { MetricPills, Pill, formatCount } from "@/components/ui";
import { scoreTier } from "@/lib/research/outlier";
import type { FeedVideo } from "@/lib/research/store";

// One video in the feed. The three metric pills are the whole point of the
// card: a raw view count says almost nothing across channels of different
// sizes, so the multiple comes first and the views come second.

function relativeAge(iso: string | null): string {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return "today";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

const PLATFORM_MARK: Record<string, string> = {
  youtube: "YT",
  instagram: "IG",
  tiktok: "TT",
  x: "X",
};

export function VideoCard({
  video,
  analyzed,
  query,
}: {
  video: FeedVideo;
  analyzed: boolean;
  /** The feed's current query string, carried into the detail page so its
   *  prev/next arrows walk the list the user was actually looking at. */
  query?: string;
}) {
  const href = `/dashboard/research/${video.id}${query ? `?${query}` : ""}`;
  const score = video.outlier_score === null ? null : Number(video.outlier_score);
  const tier = scoreTier(score, video.source.baseline_sample);
  // Instagram's business discovery hides view counts, so likes carry the
  // baseline there. Saying "views" would be a lie the user could check.
  const viewsLabel = video.source.platform === "instagram" ? "likes" : "views";

  return (
    <article
      className={`group relative flex flex-col overflow-hidden rounded-[14px] border bg-panel transition hover:border-accent ${
        tier === "validated"
          ? "border-ok"
          : tier === "outlier"
            ? "border-[rgba(22,163,74,0.4)]"
            : "border-line"
      }`}
    >
      <div className="relative aspect-[9/16] max-h-[230px] w-full overflow-hidden bg-chip">
        {video.thumbnail_url ? (
          /* A plain <img>: these thumbnails come from four platforms' CDNs on
             hosts that change, and next/image would need every one whitelisted
             to do nothing but proxy an image we never resize. */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.thumbnail_url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition group-hover:scale-[1.02]"
          />
        ) : null}

        <span className="absolute top-2 right-2 rounded-md bg-black/65 px-1.5 py-0.5 text-[9.5px] font-bold text-[#ececf0]">
          {PLATFORM_MARK[video.source.platform] ?? video.source.platform}
        </span>

        {analyzed ? (
          <span className="absolute top-2 left-2">
            <Pill tone="ok" className="text-[9.5px] font-bold">
              ✓ Analyzed
            </Pill>
          </span>
        ) : null}

        <span className="absolute bottom-2 left-2 rounded-md bg-black/65 px-1.5 py-0.5 text-[9.5px] font-semibold text-[#ececf0]">
          ◎ {formatCount(video.view_count)}
        </span>

        {/* The hover sheet. Both actions are links rather than buttons so a
            middle-click opens them in a tab, which is how people actually work
            through a feed. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex translate-y-2 gap-1.5 bg-gradient-to-t from-black/90 to-transparent p-2 opacity-0 transition group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100">
          <Link
            href={href}
            className="flex-1 rounded-lg bg-accent px-2 py-1.5 text-center text-xs font-semibold text-accent-ink"
          >
            {analyzed ? "Open analysis" : "Analyze video"}
          </Link>
          <a
            href={video.url}
            target="_blank"
            rel="noreferrer"
            title="Play in new tab"
            className="rounded-lg border border-white/30 bg-black/60 px-2 py-1.5 text-xs text-white"
          >
            ↗
          </a>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 px-3 py-[11px]">
        <Link
          href={href}
          className="line-clamp-2 text-[12.5px]/[17px] font-semibold text-ink hover:underline"
        >
          {video.title}
        </Link>
        <p className="truncate text-[11px] text-faint">
          {video.source.handle ? `@${video.source.handle}` : video.source.title}
          {video.published_at ? ` · ${relativeAge(video.published_at)}` : ""}
        </p>
        <div className="mt-auto pt-1">
          <MetricPills
            score={score === null ? null : `${score.toFixed(1)}x`}
            views={video.view_count}
            engagement={
              video.engagement_rate === null ? null : Number(video.engagement_rate)
            }
            viewsLabel={viewsLabel}
          />
        </div>
      </div>
    </article>
  );
}
