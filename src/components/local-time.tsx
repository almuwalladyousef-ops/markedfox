"use client";

import { useSyncExternalStore } from "react";

// A timestamp in the VIEWER's timezone.
//
// Server components format in the droplet's timezone, so a draft the composer
// set to 9:00 PM local rendered as some other clock time on a list page. And
// formatting on the server then re-formatting on the client is a hydration
// mismatch, which React resolves by keeping the server's — wrong — text.
//
// useSyncExternalStore is the primitive for "this value does not exist on the
// server": the server snapshot is honestly false, the client snapshot true.
// Until it resolves, the fallback shows. Every date the user set themselves
// should go through this.

const noop = () => () => {};

export function LocalTime({
  value,
  mode = "datetime",
  fallback = "",
}: {
  /** An ISO timestamp. */
  value: string;
  mode?: "date" | "time" | "datetime";
  /** Rendered on the server pass, before the viewer's clock is known. */
  fallback?: string;
}) {
  const onClient = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  if (!onClient) return <>{fallback}</>;

  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return <>{fallback}</>;

  return (
    <>
      {mode === "date"
        ? at.toLocaleDateString()
        : mode === "time"
          ? at.toLocaleTimeString(undefined, {
              hour: "numeric",
              minute: "2-digit",
            })
          : at.toLocaleString()}
    </>
  );
}
