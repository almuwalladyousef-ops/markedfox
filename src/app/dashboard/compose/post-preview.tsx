"use client";

import { useState } from "react";

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
}: {
  platforms: Platform[];
  labels: Record<Platform, string>;
  caption: string;
  overrides: Partial<Record<Platform, string>>;
  media: MediaRef[];
  accountsByPlatform: Partial<Record<Platform, string[]>>;
}) {
  const [active, setActive] = useState<Platform | null>(platforms[0] ?? null);
  const platform = active && platforms.includes(active) ? active : platforms[0];
  if (!platform) return null;

  const text = overrides[platform] ?? caption;
  const fold = CAPTION_FOLD[platform];
  const folded = fold !== undefined && text.length > fold;
  const shown = folded ? `${text.slice(0, fold)}… ` : text;
  const cover = media[0];
  const accounts = accountsByPlatform[platform] ?? [];

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Preview</h2>
        <div className="flex flex-wrap gap-1 rounded-lg bg-neutral-900/60 p-1">
          {platforms.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setActive(item)}
              className={`rounded-md px-2.5 py-1 text-xs transition ${
                item === platform
                  ? "bg-neutral-800 font-medium text-neutral-50"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {labels[item]}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-start gap-6">
        <div className="w-full max-w-[16rem]">
          <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-black">
            <div className="flex items-center gap-2 px-3 py-2">
              <span className="h-6 w-6 rounded-full bg-neutral-800" />
              <span className="truncate text-xs text-neutral-300">
                {accounts[0] ?? "your account"}
              </span>
            </div>

            {platform === "x" ? (
              <div className="px-3 pb-3 text-sm leading-relaxed text-neutral-200">
                {text || (
                  <span className="text-neutral-600 italic">No caption yet</span>
                )}
              </div>
            ) : cover ? (
              <div
                className={`relative w-full bg-neutral-900 ${
                  platform === "youtube" || platform === "facebook"
                    ? "aspect-video"
                    : "aspect-[9/16]"
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
                  <img src={cover.url} alt="" className="h-full w-full object-cover" />
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                  <p className="line-clamp-3 text-[11px] leading-relaxed text-white">
                    {shown}
                    {folded ? (
                      <span className="text-neutral-400">more</span>
                    ) : null}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex aspect-[9/16] items-center justify-center bg-neutral-900 text-xs text-neutral-600">
                no media yet
              </div>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div>
            <p className="text-[10px] font-semibold tracking-widest text-neutral-500 uppercase">
              Going to
            </p>
            <p className="mt-1 text-sm text-neutral-300">
              {accounts.length === 0
                ? "no account on this platform"
                : accounts.join(", ")}
            </p>
          </div>

          {folded ? (
            <div>
              <p className="text-[10px] font-semibold tracking-widest text-neutral-500 uppercase">
                Caption fold
              </p>
              <p className="mt-1 text-sm text-neutral-400">
                {labels[platform]} hides everything past roughly {fold}{" "}
                characters behind &ldquo;more&rdquo;. Yours is {text.length}.
              </p>
            </div>
          ) : null}

          {platform === "x" && media.length > 0 ? (
            <p className="text-sm text-amber-300">
              X posts are caption-only here — the media goes to the other
              platforms, not to X.
            </p>
          ) : null}

          {cover && platform === "instagram" ? (
            <div>
              <p className="text-[10px] font-semibold tracking-widest text-neutral-500 uppercase">
                In the grid
              </p>
              <div className="mt-2 grid w-32 grid-cols-3 gap-0.5">
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
                    <span
                      key={index}
                      className="aspect-square w-full bg-neutral-900"
                    />
                  ),
                )}
              </div>
              <p className="mt-1.5 text-xs text-neutral-500">
                A 9:16 video crops to a square here.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
