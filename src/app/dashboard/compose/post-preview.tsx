"use client";

import { useState } from "react";

import { FoxMark } from "@/components/ui";
import type { MediaRef, Platform } from "@/lib/platforms/types";

// How the post will look where it lands.
//
// Not a pixel-accurate mock of anybody's app — that would rot the week
// Instagram redesigns something. What it is accurate about is the things that
// actually differ and that people get wrong: where the caption truncates, that
// X takes no media here, that a 9:16 video crops square in the profile grid,
// and which of the five accounts each version is going to.

const CAPTION_FOLD: Partial<Record<Platform, number>> = {
  instagram: 125,
  facebook: 250,
  threads: 200,
  tiktok: 100,
  youtube: 100,
};

export function PostPreview({
  platforms,
  labels,
  caption,
  overrides,
  media,
  accountsByPlatform,
  scheduledFor,
}: {
  platforms: Platform[];
  labels: Record<Platform, string>;
  caption: string;
  overrides: Partial<Record<Platform, string>>;
  media: MediaRef[];
  accountsByPlatform: Partial<Record<Platform, string[]>>;
  /** The datetime-local value when the post is scheduled, so the mock says
   *  when it goes out rather than "Just now". */
  scheduledFor?: string | null;
}) {
  const [active, setActive] = useState<Platform | null>(platforms[0] ?? null);
  const platform = active && platforms.includes(active) ? active : platforms[0];
  if (!platform) return null;

  const text = overrides[platform] ?? caption;
  const fold = CAPTION_FOLD[platform];
  const folded = fold !== undefined && text.length > fold;
  const cover = media[0];
  const accounts = accountsByPlatform[platform] ?? [];
  const when = scheduledFor
    ? new Date(scheduledFor).toLocaleString(undefined, {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Just now";

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-semibold tracking-[0.06em] text-faint uppercase">
        Preview
      </p>

      <div className="rounded-2xl border border-line bg-panel p-4 shadow-panel">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-accent-soft">
            <FoxMark className="h-3" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[12.5px] font-semibold text-ink">
              {accounts[0] ?? "your account"}
            </span>
            <span className="block text-[10.5px] text-faint">{when}</span>
          </span>
        </div>

        {cover ? (
          <div
            className={`relative mt-3 w-full overflow-hidden rounded-xl bg-chip ${
              platform === "youtube" || platform === "facebook"
                ? "aspect-video"
                : "aspect-square"
            }`}
          >
            {cover.type === "video" ? (
              <video
                src={cover.url}
                className="h-full w-full object-cover"
                muted
                playsInline
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cover.url}
                alt=""
                className="h-full w-full object-cover"
              />
            )}
          </div>
        ) : platform === "x" ? null : (
          <div className="mt-3 flex aspect-square items-center justify-center rounded-xl bg-chip text-lg text-faint">
            ◲
          </div>
        )}

        <p className="mt-3 text-[13px]/[19.5px] whitespace-pre-wrap text-ink">
          {text || (
            <span className="text-faint">
              Start typing — your post shows up here.
            </span>
          )}
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {platforms.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setActive(item)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                item === platform
                  ? "bg-accent-soft text-accent"
                  : "bg-chip text-muted hover:text-ink"
              }`}
            >
              {labels[item]}
            </button>
          ))}
        </div>
      </div>

      {/* The three things a preview is actually for: where this platform cuts
          the caption, that X carries no media, and how a vertical video lands
          in the Instagram grid. */}
      {folded ? (
        <p className="text-[11px]/[16px] text-faint">
          {labels[platform]} hides everything past roughly {fold} characters
          behind “more”. Yours is {text.length}.
        </p>
      ) : null}

      {platform === "x" && media.length > 0 ? (
        <p className="text-[11px]/[16px] text-warn">
          X posts are caption-only here — the media goes to the other platforms,
          not to X.
        </p>
      ) : null}

      {cover && platform === "instagram" ? (
        <div>
          <div className="grid w-28 grid-cols-3 gap-0.5">
            {Array.from({ length: 9 }, (_, index) =>
              index === 0 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={index}
                  src={cover.url}
                  alt=""
                  className="aspect-square w-full object-cover"
                />
              ) : (
                <span key={index} className="aspect-square w-full bg-chip" />
              ),
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-faint">
            A 9:16 video crops to a square in the grid.
          </p>
        </div>
      ) : null}

      <p className="text-[11px]/[16px] text-faint">
        Every platform&rsquo;s limits are checked while you type — never after
        you hit publish.
      </p>
    </div>
  );
}
