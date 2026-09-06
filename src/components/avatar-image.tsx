"use client";

import { useState, type ReactNode } from "react";

// One <img> that knows how to fail.
//
// Every avatar in this app is a URL we stored earlier and do not control: our
// own R2 objects, which can be replaced or purged, and the platforms' CDNs,
// which reissue paths whenever they like. A stored URL therefore outlives the
// image it points at, and a bare <img> answers that with the browser's
// broken-image glyph — a torn page sitting inside a 44px circle, which reads
// as the layout being wrong rather than as a picture being gone.
//
// Found live on 2026-09-06: the owner's own avatar_url was a 404, so the
// Account tab and the settings profile card both rendered the glyph.
//
// `fallback` is whatever the site already draws when there is no picture at
// all — an initial, a platform mark — so a dead URL degrades to exactly the
// same thing as never having had one.
//
// A plain <img> rather than next/image on purpose: these come from whichever
// CDN each platform uses this month, and next/image would need every one of
// them whitelisted to do nothing but proxy an image we never resize.

export function AvatarImage({
  src,
  className,
  fallback,
  alt = "",
}: {
  src: string | null | undefined;
  className?: string;
  fallback: ReactNode;
  alt?: string;
}) {
  // The URL that failed, not a boolean. React keeps state across a re-render
  // with new props, so a boolean would let one dead avatar suppress every
  // later one this element renders — switch accounts and the new person's
  // picture would be hidden by the old one's 404. Comparing the stored URL to
  // the current one clears itself.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || failedSrc === src) return <>{fallback}</>;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      // `onError` alone is not enough, and this is the whole reason the ref is
      // here. These pages are server-rendered, so the browser starts fetching
      // the image from the HTML long before React hydrates. A URL that 404s
      // has already failed by then, its error event fired against no listener,
      // and the handler below is attached to an image that will never error
      // again — leaving the broken glyph on screen forever. The ref runs on
      // attach and asks the element directly: finished loading, but no pixels?
      // Then it failed, whoever was listening.
      ref={(node) => {
        if (node && node.complete && node.naturalWidth === 0) setFailedSrc(src);
      }}
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailedSrc(src)}
    />
  );
}
