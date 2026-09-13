"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

// A thin accent bar along the top of the screen from the moment a link is
// pressed until the next page is showing.
//
// Every dashboard page reads on the server, and Next keeps the old page on
// screen until the new route has at least its loading skeleton. On a slow
// connection, or before a link has been prefetched, that gap is a press that
// visibly does nothing. This answers the press itself.
//
// It listens in the capture phase because next/link calls preventDefault in
// its own click handler, which would otherwise hide the click from a bubbling
// listener. "Pending" is simply "still on the page the press was made from",
// so arriving anywhere clears it without any bookkeeping, and a safety timer
// clears it if the navigation never happens.

const SAFETY_MS = 12_000;

function here(pathname: string, search: string): string {
  return search ? `${pathname}?${search}` : pathname;
}

export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [pressedOn, setPressedOn] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if ((anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const from = here(window.location.pathname, window.location.search.replace(/^\?/, ""));
      if (here(url.pathname, url.search.replace(/^\?/, "")) === from) return;

      setPressedOn(from);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setPressedOn(null), SAFETY_MS);
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (pressedOn === null || pressedOn !== here(pathname, search)) return null;

  return (
    <div
      role="progressbar"
      aria-label="Loading page"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]"
    >
      <div className="mf-nav-progress h-full w-full bg-accent" />
    </div>
  );
}
