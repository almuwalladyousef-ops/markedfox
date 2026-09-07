import Link from "next/link";

import { Icon } from "@/components/icons";
import { PlatformTile } from "@/components/platform-icon";
import { MetricPills, Pill, cx } from "@/components/ui";
import { scoreTier } from "@/lib/research/outlier";
import { saveVideoAction } from "@/lib/research/studio-actions";
import type { Platform } from "@/lib/platforms/types";
import type { FeedVideo } from "@/lib/research/store";

// One video in the feed. The three metric pills are the whole point of the
// card: a raw view count says almost nothing across channels of different
// sizes, so the multiple comes first and the views come second.
//
// Two shapes, one component. Above the `shell` breakpoint it is a tile in a
// grid, and its actions live in a sheet that slides up on hover. On a phone
// there is no hover, so that sheet would be a pair of controls nobody could
// reach: below `shell` the card goes full width, the thumbnail gets taller
// (4:5 rather than a 260px-capped 9:16, which on a 375px screen was a stamp
// with a caption), and the same two actions render as real buttons under it.

function relativeAge(iso: string | null): string {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return "today";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function VideoCard({
  video,
  analyzed,
  saved,
  query,
}: {
  video: FeedVideo;
  analyzed: boolean;
  /** Kept for later, without any judgement about whether it is worth making. */
  saved: boolean;
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
  // The feed carries four platforms and the registry knows nine; anything
  // unexpected falls back to YouTube's mark rather than crashing the grid.
  const mark = (
    ["youtube", "instagram", "tiktok", "x"].includes(video.source.platform)
      ? video.source.platform
      : "youtube"
  ) as Platform;

  return (
    <article
      className={cx(
        "group relative flex flex-col overflow-hidden rounded-2xl border bg-panel transition-[border-color] duration-110 hover:border-accent",
        tier === "validated"
          ? "border-ok"
          : tier === "outlier"
            ? "border-[rgba(22,163,74,0.4)]"
            : "border-line",
      )}
    >
      {/* The card is one link, stretched over the whole tile.
          It used to be three separate targets — the title, and two buttons in
          a sheet that only appeared on hover — so clicking the thumbnail, which
          is the biggest and most obvious thing on the card, did nothing at all.
          `absolute inset-0` on an anchor under the content is the version that
          keeps the "play in new tab" anchor clickable above it; wrapping the
          card in an <a> would nest one anchor inside another. */}
      <Link
        href={href}
        aria-label={`Open ${video.title}`}
        className="absolute inset-0 z-0"
      />

      <div className="pointer-events-none relative aspect-[4/5] w-full overflow-hidden bg-chip shell:aspect-[9/16] shell:max-h-[260px]">
        {video.thumbnail_url ? (
          /* A plain <img>: these thumbnails come from four platforms' CDNs on
             hosts that change, and next/image would need every one whitelisted
             to do nothing but proxy an image we never resize. */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.thumbnail_url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-160 group-hover:scale-[1.02]"
          />
        ) : null}

        {/* The platform's own mark rather than a two-letter abbreviation. On
            a grid of forty thumbnails the abbreviation had to be read; the
            mark is recognised. */}
        <span className="absolute top-2 right-2">
          <PlatformTile platform={mark} size={22} />
        </span>

        {analyzed ? (
          <span className="absolute top-2 left-2">
            <Pill tone="ok" className="bg-ok text-white">
              <Icon name="check" className="h-2.5 w-2.5" strokeWidth={3} />
              Analyzed
            </Pill>
          </span>
        ) : null}

        {/* Save sits on the thumbnail and is always visible, not only on
            hover: it is the one thing you want to do while scrolling past,
            and a control that appears under the pointer cannot be found on a
            phone at all. */}
        <form
          action={saveVideoAction}
          className="pointer-events-auto absolute top-2 left-2 z-10"
          style={analyzed ? { top: "2.25rem" } : undefined}
        >
          <input type="hidden" name="video_id" value={video.id} />
          <button
            type="submit"
            aria-label={saved ? `Unsave ${video.title}` : `Save ${video.title}`}
            title={saved ? "Saved" : "Save"}
            className={cx(
              "flex h-7 w-7 items-center justify-center rounded-full border transition-colors duration-110",
              saved
                ? "border-transparent bg-warn text-white"
                : "border-white/30 bg-black/55 text-white hover:bg-black/75",
            )}
          >
            <Icon
              name="star"
              className="h-3.5 w-3.5"
              fill={saved ? "currentColor" : "none"}
            />
          </button>
        </form>

        {/* The hover sheet. Both actions are links rather than buttons so a
            middle-click opens them in a tab, which is how people actually work
            through a feed. */}
        {/* Orange is "there is work to do here". An analysed video has had its
            work done, so its call to action goes quiet and the green pill above
            carries the state instead. Both used to be accent, which made a
            worked-through feed look exactly like an untouched one. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden translate-y-2 gap-1.5 bg-gradient-to-t from-black/90 to-transparent p-2 opacity-0 transition-[opacity,translate] duration-160 group-hover:translate-y-0 group-hover:opacity-100 shell:flex">
          <span
            className={cx(
              "flex-1 rounded-md px-2.5 py-2 text-center text-[13px] font-semibold",
              analyzed
                ? "border border-white/30 bg-black/60 text-white"
                : "bg-accent text-accent-ink",
            )}
          >
            {analyzed ? "Open analysis" : "Analyze video"}
          </span>
          <a
            href={video.url}
            target="_blank"
            rel="noreferrer"
            title="Play in new tab"
            aria-label="Play in new tab"
            className="pointer-events-auto relative z-10 flex items-center rounded-md border border-white/30 bg-black/60 px-2.5 text-white"
          >
            <Icon name="external" className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      <div className="pointer-events-none relative flex flex-1 flex-col gap-2 px-4 py-3.5 shell:px-3.5 shell:py-3">
        <p
          title={video.title}
          // Two lines on a phone, one on the grid tile. A feed card that
          // truncates the title at 340px wide is a feed of ellipses.
          className="line-clamp-2 text-[15px]/[21px] font-semibold text-pretty text-ink group-hover:underline shell:truncate shell:text-[14px]"
        >
          {video.title}
        </p>
        <p className="truncate text-[13px] text-faint shell:text-[12.5px]">
          {video.source.handle ? `@${video.source.handle}` : video.source.title}
          {video.published_at ? ` · ${relativeAge(video.published_at)}` : ""}
        </p>
        <div className="mt-auto pt-1.5">
          <MetricPills
            score={score === null ? null : `${score.toFixed(1)}x`}
            views={video.view_count}
            engagement={
              video.engagement_rate === null ? null : Number(video.engagement_rate)
            }
            viewsLabel={viewsLabel}
          />
        </div>

        {/* The touch half of the hover sheet above. Both are links so a
            long-press offers "open in new tab", which is how people work
            through a feed on a phone too. */}
        <div className="pointer-events-auto relative z-10 flex gap-2 pt-1 shell:hidden">
          <Link
            href={href}
            className={cx(
              "flex min-h-[44px] flex-1 items-center justify-center rounded-lg px-3 text-[14px] font-semibold transition-transform duration-110 active:scale-[0.97]",
              analyzed
                ? "border border-line text-ink"
                : "bg-accent text-accent-ink",
            )}
          >
            {analyzed ? "Open analysis" : "Analyze video"}
          </Link>
          <a
            href={video.url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Play "${video.title}" in a new tab`}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-line text-muted transition-transform duration-110 active:scale-[0.97]"
          >
            <Icon name="external" className="h-4 w-4" />
          </a>
        </div>
      </div>
    </article>
  );
}
