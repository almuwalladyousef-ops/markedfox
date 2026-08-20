"use client";

import { useActionState, useState } from "react";

import { addSourceAction, type ResearchFormState } from "@/lib/research/actions";
import type { ResearchPlatform } from "@/lib/research/types";

import {
  ResearchPlatformToggles,
  type ResearchPlatformRow,
} from "./research-platform-toggles";

const EMPTY: ResearchFormState = {};

const PLACEHOLDERS: Record<ResearchPlatform, string> = {
  youtube: "@MrBeast, a channel URL, or a channel id",
  instagram: "@nike — public business or creator accounts only",
  tiktok: "your own connected account",
  x: "@handle — reads are billed per request",
};

/**
 * Adding a channel to watch. The platform is picked from the same toggle list
 * the dashboard uses, so an unusable platform explains itself in place rather
 * than silently missing from a dropdown.
 */
export function AddSourceForm({ rows }: { rows: ResearchPlatformRow[] }) {
  const [state, action, pending] = useActionState(addSourceAction, EMPTY);
  const usable = rows.filter(
    (row) => row.configured && (!row.requiresConnection || row.connected),
  );
  const [platform, setPlatform] = useState<ResearchPlatform>(
    usable[0]?.id ?? "youtube",
  );
  const chosen = rows.find((row) => row.id === platform);
  const chosenUsable = Boolean(
    chosen && chosen.configured && (!chosen.requiresConnection || chosen.connected),
  );

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-5">
      <h2 className="text-sm font-semibold">Watch a channel</h2>
      <p className="mt-1 text-xs leading-relaxed text-neutral-500">
        MarkedFox records each channel&rsquo;s videos and scores them against
        that channel&rsquo;s own recent median — so a small account&rsquo;s
        breakout ranks above a big account&rsquo;s ordinary day.
      </p>

      <ResearchPlatformToggles rows={rows} onPick={setPlatform} />

      <form action={action} className="mt-4 flex flex-col gap-3">
        <input type="hidden" name="platform" value={platform} />
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-neutral-400">
            {chosen?.label ?? "Channel"}
          </span>
          <input
            name="query"
            required
            disabled={!chosenUsable || pending}
            placeholder={PLACEHOLDERS[platform]}
            className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm outline-none transition focus:border-neutral-600 disabled:opacity-50"
          />
        </label>

        {chosen?.meteredReads ? (
          <p className="text-xs text-amber-400/80">
            Every sync of an X source costs money per read, so X sources refresh
            less and pull fewer posts.
          </p>
        ) : null}

        <button
          type="submit"
          disabled={!chosenUsable || pending}
          className="self-start rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-neutral-200 disabled:opacity-50"
        >
          {pending ? "Adding and syncing…" : "Add and sync"}
        </button>

        {state.message ? (
          <p
            className={`text-xs ${state.ok ? "text-emerald-400" : "text-red-400"}`}
          >
            {state.message}
          </p>
        ) : null}
      </form>
    </section>
  );
}
