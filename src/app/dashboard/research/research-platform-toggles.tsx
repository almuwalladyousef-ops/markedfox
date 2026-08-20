"use client";

import { useState } from "react";

import type { ResearchPlatform } from "@/lib/research/types";

export type ResearchPlatformRow = {
  id: ResearchPlatform;
  label: string;
  /** How many channels on this platform the workspace already watches. */
  watching: number;
  /** Provider env is present (or it needs none). */
  configured: boolean;
  /** A suitable account is connected, for providers that read through one. */
  connected: boolean;
  requiresConnection: boolean;
  ownContentOnly: boolean;
  meteredReads: boolean;
  /** What this platform can and cannot do, in one line. */
  note: string;
};

/**
 * The same rule as the publishing toggles: nothing is ever shown as "Locked".
 * A platform that cannot be used yet is still a toggle, and pressing it says
 * exactly what is missing — a key, a connection, or the platform's own policy.
 */
export function ResearchPlatformToggles({
  rows,
  onPick,
}: {
  rows: ResearchPlatformRow[];
  onPick?: (platform: ResearchPlatform) => void;
}) {
  const [explain, setExplain] = useState<ResearchPlatformRow | null>(null);

  return (
    <>
      <ul className="mt-4 flex flex-col gap-1 text-sm">
        {rows.map((row) => {
          const usable =
            row.configured && (!row.requiresConnection || row.connected);
          const on = row.watching > 0;

          return (
            <li
              key={row.id}
              className="flex items-center justify-between gap-4 rounded-md px-2 py-2 transition hover:bg-neutral-900/60"
            >
              <span className="flex min-w-0 flex-col">
                <span className="flex items-center gap-2">
                  <span className="font-medium">{row.label}</span>
                  {row.meteredReads ? (
                    <span
                      title="Reads on this platform are billed per request"
                      className="rounded-full border border-amber-800/60 bg-amber-950/40 px-1.5 py-0.5 text-[10px] font-medium text-amber-300"
                    >
                      Paid reads
                    </span>
                  ) : null}
                  {row.ownContentOnly ? (
                    <span
                      title="This platform only lets apps read your own account"
                      className="rounded-full border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 text-[10px] font-medium text-neutral-400"
                    >
                      Your account only
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 truncate text-xs text-neutral-500">
                  {on ? `Watching ${row.watching}` : row.note}
                </span>
              </span>

              <button
                type="button"
                aria-label={
                  usable
                    ? `Add a ${row.label} source`
                    : `Why ${row.label} research is unavailable`
                }
                onClick={() =>
                  usable && onPick ? onPick(row.id) : setExplain(row)
                }
                className={`relative inline-flex h-5 w-10 shrink-0 items-center rounded-full transition ${
                  on
                    ? "bg-emerald-600"
                    : usable
                      ? "bg-neutral-700"
                      : "bg-neutral-800"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                    on ? "translate-x-5" : "translate-x-1"
                  }`}
                />
              </button>
            </li>
          );
        })}
      </ul>

      {explain ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setExplain(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-950 p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-base font-semibold">{explain.label} research</h3>
            <p className="mt-2 text-sm leading-relaxed text-neutral-400">
              {!explain.configured
                ? `${explain.label} research is not configured on this deployment yet.`
                : explain.requiresConnection && !explain.connected
                  ? `Connect a ${explain.label} account in this workspace first — research reads through it.`
                  : explain.note}
            </p>
            <p className="mt-3 text-xs leading-relaxed text-neutral-500">
              {explain.note}
            </p>
            <button
              type="button"
              onClick={() => setExplain(null)}
              className="mt-5 w-full rounded-lg border border-neutral-700 px-4 py-2 text-sm font-medium transition hover:bg-neutral-900"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
