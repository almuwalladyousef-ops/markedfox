import type { Platform } from "@/lib/platforms/types";

// Each platform's real app icon, served from /public/platforms and supplied by
// the owner. These replaced a set of hand-drawn monochrome glyphs: a drawn
// approximation of somebody else's mark is wrong in a way people notice
// without being able to say why, and colour is what makes a 12px mark
// identifiable at all — a person scanning a grid of their own posts recognises
// the app by its colour long before they read a label.
//
// Every asset is prepared to one rule: a full square, the mark filling it edge
// to edge, no white or transparency around it. That matters because the corner
// radius belongs to the container, not to the file — an asset carrying its own
// rounded corners fights whatever it is placed inside, and shows the page
// through the gap. The one exception is YouTube, whose mark is a red play
// button on white by definition, so it keeps its white ground.
//
// Every tile carries `--platform-edge`, a hairline that flips with the theme.
// Without it YouTube's white ground vanishes into a light card and the three
// black marks vanish into a dark one; with it, neither does, and it is
// invisible on the coloured marks in between. A hairline for everything beat
// a list of which platforms need one — that list was wrong in one theme
// whichever way it was written.

const MARKS: Record<Platform, { src: string; label: string }> = {
  instagram: { src: "/platforms/instagram.png", label: "Instagram" },
  facebook: { src: "/platforms/facebook.png", label: "Facebook" },
  threads: { src: "/platforms/threads.png", label: "Threads" },
  tiktok: { src: "/platforms/tiktok.svg", label: "TikTok" },
  youtube: { src: "/platforms/youtube.png", label: "YouTube" },
  x: { src: "/platforms/x.png", label: "X" },
  snapchat: { src: "/platforms/snapchat.png", label: "Snapchat" },
  linkedin: { src: "/platforms/linkedin.png", label: "LinkedIn" },
  pinterest: { src: "/platforms/pinterest.png", label: "Pinterest" },
};

const EDGE = "inset 0 0 0 1px var(--platform-edge)";

export function platformLabel(platform: Platform): string {
  return MARKS[platform].label;
}

/**
 * The mark on its own, sized by the caller's className. Square by
 * construction; `object-cover` is belt-and-braces in case a caller sizes it to
 * a rectangle. Callers wanting it rounded add the radius and `overflow-hidden`
 * themselves — see `PlatformTile` and `PlatformBadge`, which is most of them.
 */
export function PlatformIcon({
  platform,
  className = "h-3.5 w-3.5",
  title,
}: {
  platform: Platform;
  className?: string;
  /** Set when the icon stands alone; omit when a label sits beside it. */
  title?: string;
}) {
  const mark = MARKS[platform];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={mark.src}
      alt={title ? mark.label : ""}
      title={title}
      aria-hidden={title ? undefined : true}
      draggable={false}
      className={`shrink-0 object-cover ${className}`}
    />
  );
}

/**
 * The app tile: the platform's own icon at a given edge length. Radius follows
 * at 30% of the size, which is what keeps a 20px badge and a 40px settings
 * tile looking like one shape, and the image is clipped to it rather than
 * carrying corners of its own.
 *
 * This is the treatment for anywhere the platform is the subject — the
 * settings account list, the composer's platform grid, the calendar filter row
 * — as opposed to `PlatformBadge`, which is the small round badge stamped on a
 * thumbnail.
 */
export function PlatformTile({
  platform,
  size = 32,
  /** 999 where the mark reads as an avatar badge rather than an app icon. */
  radius,
  className,
  title,
}: {
  platform: Platform;
  size?: number;
  radius?: number;
  className?: string;
  title?: string;
}) {
  const mark = MARKS[platform];
  return (
    <span
      title={title ?? mark.label}
      className={`inline-flex shrink-0 overflow-hidden ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius ?? Math.round(size * 0.3),
        boxShadow: EDGE,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={mark.src}
        alt=""
        draggable={false}
        className="h-full w-full object-cover"
      />
    </span>
  );
}

/** The brand badge used on grid tiles and in the composer's platform picker.
 *  Shape lives in the caller's className, not baked in: the grid wants a
 *  circle and the composer's picker wants an app-icon square, and a hardcoded
 *  rounded-full here would win over either depending on stylesheet order. */
export function PlatformBadge({
  platform,
  className = "h-6 w-6 rounded-full",
  title,
}: {
  platform: Platform;
  className?: string;
  title?: string;
}) {
  const mark = MARKS[platform];
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 overflow-hidden ${className}`}
      style={{ boxShadow: EDGE }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={mark.src}
        alt=""
        draggable={false}
        className="h-full w-full object-cover"
      />
    </span>
  );
}
