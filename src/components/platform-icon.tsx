import type { Platform } from "@/lib/platforms/types";

// One monochrome mark per platform, drawn rather than imported: the home
// screen and the calendar both stack several of these at 14px on top of
// photographs, where a colour logo turns to mush and a two-letter abbreviation
// reads as noise. They inherit currentColor, so the same glyph works on a
// light chip and over a dark thumbnail.

const PATHS: Record<Platform, { path: string; label: string }> = {
  instagram: {
    label: "Instagram",
    path:
      "M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7Zm5 3.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM17.5 6a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Z",
  },
  x: {
    label: "X",
    path:
      "M3 3h5.2l4.1 5.6L17.4 3H21l-6.7 7.7L21.4 21H16l-4.4-6-5.2 6H2.6l7.1-8.2L3 3Zm3.1 1.6 10 13.8h1.9L8.1 4.6H6.1Z",
  },
  threads: {
    label: "Threads",
    path:
      "M12.2 2C6.9 2 3.4 5.4 3.4 12s3.5 10 8.8 10c4.2 0 6.6-2.1 7.3-4.6.6-2.4-.5-4.5-2.9-5.4-.3-1.8-1.6-3-3.7-3-1.7 0-3 .7-3.7 2l1.7 1c.4-.7 1.1-1.1 2-1.1 1 0 1.6.5 1.8 1.4-2.7-.2-4.7 1-4.9 3.1-.2 1.8 1.2 3.2 3.3 3.2 1.8 0 3-.9 3.6-2.4 1 .6 1.4 1.6 1.1 2.7-.4 1.6-2.1 3.1-5.6 3.1-4.1 0-6.7-2.6-6.7-8s2.6-8 6.7-8c2.8 0 4.8 1.1 5.9 3.2l1.8-.9C18.4 3.5 15.8 2 12.2 2Zm.3 12.6c-.3 1-1 1.6-1.9 1.6-.8 0-1.4-.5-1.3-1.2.1-.9 1.1-1.4 2.6-1.2h.6v.8Z",
  },
  facebook: {
    label: "Facebook",
    path:
      "M13.5 21v-8h2.7l.4-3.1h-3.1V7.9c0-.9.3-1.5 1.6-1.5h1.6V3.6c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.4-4 4.1v2.3H7.5V13h2.8v8h3.2Z",
  },
  tiktok: {
    label: "TikTok",
    path:
      "M14 2h3c.3 2.2 1.6 3.7 3.9 3.9v3c-1.5.1-2.8-.3-4-1v6.4c0 4.1-3.3 6.7-6.9 5.6-2.6-.8-4.2-3.3-4-6 .2-2.9 2.7-5.1 5.6-5v3.2c-.4-.1-.8-.2-1.2-.1-1.3.1-2.3 1.2-2.2 2.5.1 1.3 1.2 2.3 2.5 2.2 1.3-.1 2.3-1.2 2.3-2.6V2Z",
  },
  youtube: {
    label: "YouTube",
    path:
      "M21.6 7.2c-.2-1.1-1-1.9-2-2.1C17.7 4.7 12 4.7 12 4.7s-5.7 0-7.6.4c-1 .2-1.8 1-2 2.1C2 9 2 12 2 12s0 3 .4 4.8c.2 1.1 1 1.9 2 2.1 1.9.4 7.6.4 7.6.4s5.7 0 7.6-.4c1-.2 1.8-1 2-2.1.4-1.8.4-4.8.4-4.8s0-3-.4-4.8ZM10.2 15.1V8.9l5.2 3.1-5.2 3.1Z",
  },
  snapchat: {
    label: "Snapchat",
    path:
      "M12 2.3c2.7 0 4.6 2 4.6 4.6 0 .8-.1 1.6-.1 2.2.4.2.9.2 1.4 0 .3-.1.7 0 .9.3.2.4.1.8-.2 1.1-.5.4-1.2.7-1.8.9.4 1.4 1.6 2.9 3.3 3.4.4.1.6.5.5.9-.2.7-1.3 1.1-2.5 1.3-.1.3-.2.6-.3.9-.1.3-.4.4-.7.4-.6-.1-1.4-.2-2.2 0-.7.2-1.4 1.2-2.9 1.2s-2.2-1-2.9-1.2c-.8-.2-1.6-.1-2.2 0-.3 0-.6-.1-.7-.4-.1-.3-.2-.6-.3-.9-1.2-.2-2.3-.6-2.5-1.3-.1-.4.1-.8.5-.9 1.7-.5 2.9-2 3.3-3.4-.6-.2-1.3-.5-1.8-.9-.3-.3-.4-.7-.2-1.1.2-.3.6-.4.9-.3.5.2 1 .2 1.4 0 0-.6-.1-1.4-.1-2.2C7.4 4.3 9.3 2.3 12 2.3Z",
  },
  linkedin: {
    label: "LinkedIn",
    path:
      "M4.5 3.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM3 9h3v12H3V9Zm6 0h2.9v1.6h.1c.4-.8 1.5-1.7 3.1-1.7 3.3 0 3.9 2.1 3.9 4.9V21h-3v-5.5c0-1.3 0-3-1.9-3s-2.1 1.4-2.1 2.9V21H9V9Z",
  },
  pinterest: {
    label: "Pinterest",
    path:
      "M12 2a10 10 0 0 0-3.6 19.3c-.1-.8-.2-2 0-2.9l1.2-5.1s-.3-.6-.3-1.5c0-1.4.8-2.5 1.9-2.5.9 0 1.3.7 1.3 1.5 0 .9-.6 2.2-.9 3.5-.2 1 .5 1.9 1.6 1.9 1.9 0 3.2-2.4 3.2-5.3 0-2.2-1.5-3.8-4.1-3.8-3 0-4.9 2.2-4.9 4.7 0 .9.3 1.5.7 2 .2.2.2.3.1.6l-.2.9c-.1.3-.3.4-.5.3-1.4-.6-2.1-2.2-2.1-4 0-3 2.5-6.6 7.4-6.6 4 0 6.6 2.9 6.6 6 0 4-2.3 7-5.6 7-1.1 0-2.2-.6-2.5-1.3l-.7 2.7c-.3 1-.9 2-1.4 2.7A10 10 0 1 0 12 2Z",
  },
};

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
  const mark = PATHS[platform];
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title ? <title>{mark.label}</title> : null}
      <path d={mark.path} />
    </svg>
  );
}
