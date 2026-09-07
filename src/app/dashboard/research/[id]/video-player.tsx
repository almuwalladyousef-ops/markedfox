import { Icon } from "@/components/icons";
import type { ResearchPlatform } from "@/lib/research/types";

// Watching the video where you are reading about it.
//
// Before this, the page showed a thumbnail whose only action was "open the
// platform in a new tab" — so judging a hook meant leaving the analysis, and
// coming back meant finding your place again. The two things you are comparing
// belong on the same screen.
//
// Only two platforms can be embedded. YouTube publishes a player; Instagram
// publishes an embed for public posts. TikTok's embed needs a script we would
// have to allow through the CSP, and X's needs the same — both are worth doing
// later and neither is worth loosening `script-src` for today. Those keep the
// thumbnail, and it is a link rather than a dead image.

/** The id inside a YouTube URL, in any of the shapes a platform hands back. */
export function youtubeId(url: string): string | null {
  const match =
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,20})/.exec(
      url,
    );
  return match?.[1] ?? null;
}

/** Instagram permalinks are `/p/<code>/`, `/reel/<code>/` or `/tv/<code>/`. */
export function instagramCode(url: string): string | null {
  const match = /instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/.exec(url);
  return match?.[1] ?? null;
}

export function embedUrl(
  platform: ResearchPlatform | string,
  url: string,
): string | null {
  if (platform === "youtube") {
    const id = youtubeId(url);
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (platform === "instagram") {
    const code = instagramCode(url);
    return code ? `https://www.instagram.com/p/${code}/embed` : null;
  }
  return null;
}

export function VideoPlayer({
  platform,
  url,
  thumbnailUrl,
  title,
}: {
  platform: ResearchPlatform | string;
  url: string;
  thumbnailUrl: string | null;
  title: string;
}) {
  const embed = embedUrl(platform, url);
  // YouTube is landscape and everything else here is a vertical post. Giving
  // both the same frame either letterboxes one or crops the other.
  const ratio = platform === "youtube" ? "aspect-video" : "aspect-[9/16]";

  if (embed) {
    return (
      <div
        className={`w-full overflow-hidden rounded-2xl border border-line bg-black ${ratio}`}
      >
        <iframe
          src={embed}
          title={title}
          className="h-full w-full"
          // No `allow="autoplay"`: this page is a grid of things to compare,
          // and a video that starts talking on open is a thing you close.
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className={`group relative block w-full overflow-hidden rounded-2xl border border-line bg-chip ${ratio}`}
    >
      {thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
      ) : null}
      <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/35 text-white opacity-0 transition-[opacity] duration-110 group-hover:opacity-100">
        <Icon name="play" className="h-10 w-10" strokeWidth={1.4} />
        <span className="text-[13px] font-medium">
          Watch on {String(platform)}
        </span>
      </span>
    </a>
  );
}
