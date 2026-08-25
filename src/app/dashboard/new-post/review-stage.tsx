"use client";

import { useState } from "react";

import { Icon } from "@/components/icons";
import { PlatformTile } from "@/components/platform-icon";
import { cx } from "@/components/ui";
import type { Platform } from "@/lib/platforms/types";

// The last step: the post as it will look where it lands, not a list of what
// was filled in.
//
// The previous version was a stack of cards — one per platform, each with the
// caption printed in a box. It told you what you had typed, which you already
// knew, and told you nothing about the thing you were about to publish. This
// shows the frame with the platform's own chrome over it, and the two derived
// views people actually worry about: what the thumbnail will be cropped to,
// and what it does to the profile grid.

type Props = {
  platforms: Platform[];
  labels: Record<Platform, string>;
  caption: string;
  overrides: Partial<Record<Platform, string>>;
  /** The local preview URL, so the review plays the same bytes the file step
   *  did rather than waiting on an upload that has not happened. */
  mediaUrl: string | null;
  mediaType: "image" | "video" | null;
  accountName: string | null;
  accountAvatar: string | null;
};

/** Which platforms crop a vertical video into a square grid cell, and so have
 *  a "grid" worry worth showing. */
const GRID_PLATFORMS: Platform[] = ["instagram", "facebook"];

const VIEW_LABEL: Partial<Record<Platform, string>> = {
  instagram: "Reels view",
  tiktok: "For You view",
  youtube: "Shorts view",
  facebook: "Reels view",
};

export function ReviewStage({
  platforms,
  labels,
  caption,
  overrides,
  mediaUrl,
  mediaType,
  accountName,
  accountAvatar,
}: Props) {
  const [active, setActive] = useState<Platform>(platforms[0] ?? "instagram");
  const platform = platforms.includes(active) ? active : (platforms[0] ?? null);
  const text = platform ? (overrides[platform] ?? caption) : caption;

  const media =
    mediaUrl && mediaType === "video" ? (
      <video
        key={mediaUrl}
        src={mediaUrl}
        className="h-full w-full object-cover"
        autoPlay
        loop
        muted
        playsInline
      />
    ) : mediaUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={mediaUrl} alt="" className="h-full w-full object-cover" />
    ) : (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <p className="text-[13px]/[20px] text-pretty text-white/70">
          {text || "No caption"}
        </p>
      </div>
    );

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="flex items-start justify-center gap-5">
        {/* The post itself, with the chrome the platform puts over it. The
            controls are decoration — they are what the viewer will see, not
            anything to press here. */}
        <div className="relative w-[286px] shrink-0 overflow-hidden rounded-[20px] bg-black shadow-[0_24px_60px_rgba(0,0,0,.28)]">
          <div className="aspect-[9/16] w-full">{media}</div>

          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex flex-col justify-end"
          >
            <span className="absolute top-0 right-0 bottom-0 flex w-14 flex-col items-center justify-center gap-5 text-white">
              {(["spark", "chat", "arrowRight"] as const).map((name) => (
                <span key={name} className="flex flex-col items-center gap-0.5">
                  <Icon
                    name={name}
                    className="h-[26px] w-[26px] drop-shadow-[0_1px_3px_rgba(0,0,0,.6)]"
                  />
                  <span className="text-[10px] font-semibold drop-shadow-[0_1px_3px_rgba(0,0,0,.6)]">
                    –
                  </span>
                </span>
              ))}
            </span>

            <div className="relative flex items-end gap-2 bg-gradient-to-t from-black/65 to-transparent px-3 pt-10 pb-3.5">
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="flex items-center gap-2">
                  <span className="h-6 w-6 shrink-0 overflow-hidden rounded-full bg-white/25">
                    {accountAvatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={accountAvatar}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </span>
                  <span className="truncate text-[12.5px] font-semibold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,.6)]">
                    {accountName ?? "your account"}
                  </span>
                </span>
                {text ? (
                  <span className="line-clamp-2 pr-10 text-[11.5px]/[16px] text-white/90 drop-shadow-[0_1px_3px_rgba(0,0,0,.6)]">
                    {text}
                  </span>
                ) : null}
              </span>
            </div>
          </div>
        </div>

        {/* What the same file becomes elsewhere. Both are the honest answers
            to "will my face be cut off" — the one question a preview is for. */}
        {mediaUrl ? (
          <div className="flex flex-col gap-4">
            <figure className="m-0">
              <div className="h-[132px] w-[76px] overflow-hidden rounded-xl bg-chip shadow-[0_6px_18px_rgba(0,0,0,.14)]">
                {mediaType === "video" ? (
                  <video
                    src={mediaUrl}
                    className="h-full w-full object-cover"
                    muted
                    playsInline
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={mediaUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              <figcaption className="mt-1.5 text-center text-[11.5px] text-muted">
                Thumbnail
              </figcaption>
            </figure>

            {platform && GRID_PLATFORMS.includes(platform) ? (
              <figure className="m-0">
                <div className="grid h-[76px] w-[76px] grid-cols-3 grid-rows-3 gap-px overflow-hidden rounded-xl bg-line">
                  <span className="col-span-1 row-span-1 overflow-hidden bg-chip">
                    {mediaType === "video" ? (
                      <video
                        src={mediaUrl}
                        className="h-full w-full object-cover"
                        muted
                        playsInline
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={mediaUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    )}
                  </span>
                  {Array.from({ length: 8 }, (_, i) => (
                    <span key={i} className="bg-panel" />
                  ))}
                </div>
                <figcaption className="mt-1.5 text-center text-[11.5px] text-muted">
                  {platform ? (VIEW_LABEL[platform] ?? "Grid") : "Grid"}
                </figcaption>
              </figure>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* The row is the selector: press a platform to see its chrome. */}
      {platforms.length > 0 ? (
        <ul className="flex flex-wrap items-center justify-center gap-2.5">
          {platforms.map((item) => {
            const on = item === platform;
            return (
              <li key={item}>
                <button
                  type="button"
                  onClick={() => setActive(item)}
                  aria-pressed={on}
                  title={`Preview as ${labels[item]}`}
                  className={cx(
                    "block rounded-[13px] p-1 transition-[background,opacity] duration-150",
                    on ? "bg-chip" : "opacity-55 hover:opacity-100",
                  )}
                >
                  <PlatformTile platform={item} size={32} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
