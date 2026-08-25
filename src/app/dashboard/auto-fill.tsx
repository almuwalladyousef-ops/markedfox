"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

import { fillAccountsAction } from "@/lib/accounts/actions";

// The first-load fill.
//
// An account connected thirty seconds ago has nothing in the cache and the
// background sweep is minutes away, so the home screen would greet a brand new
// user with an empty grid — the worst possible first impression of a screen
// whose whole job is showing them their own work. This fires the same
// throttled sync the sweep runs, once, and refreshes the page when it answers.
//
// A client component for one reason: it has to happen AFTER the page paints.
// Doing it during the render would make every first load wait on Instagram.

export function AutoFill() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const fired = useRef(false);

  useEffect(() => {
    // React runs effects twice in development; the server action is throttled
    // anyway, but not firing twice is cheaper than being throttled twice.
    if (fired.current) return;
    fired.current = true;

    void fillAccountsAction().then(() => {
      startTransition(() => router.refresh());
    });
  }, [router]);

  return (
    <p className="rounded-md bg-chip px-3.5 py-2 text-[12px] text-muted">
      Reading your connected accounts…
    </p>
  );
}
