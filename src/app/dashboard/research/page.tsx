import type { Metadata } from "next";

import Link from "next/link";

import { requireUser } from "@/lib/auth/session";
import { listConnections } from "@/lib/connections/store";
import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import { deleteSourceAction, syncSourceAction } from "@/lib/research/actions";
import { configuredModel } from "@/lib/research/generate";
import { describeScore, OUTLIER_THRESHOLD } from "@/lib/research/outlier";
import {
  isResearchProviderConfigured,
  listResearchProviders,
} from "@/lib/research/providers";
import { listFeed, listSources } from "@/lib/research/store";
import type { ResearchPlatform } from "@/lib/research/types";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/store";

import { AddSourceForm } from "./add-source-form";
import type { ResearchPlatformRow } from "./research-platform-toggles";

export const metadata: Metadata = { title: "Research · MarkedFox" };

// Pillar 3's home: the channels this workspace watches, and the outlier feed —
// every video ranked by how far it beat its OWN channel's baseline.

const NOTES: Record<ResearchPlatform, string> = {
  youtube:
    "Reads any public channel's videos and view counts. The richest source, and it needs no connection.",
  instagram:
    "Reads any public business or creator account through one of your connected Instagram accounts. Instagram hides view counts here, so likes carry the score.",
  tiktok:
    "TikTok's research API is limited to academic institutions, so apps can only read the connected account's own videos. Track your own TikTok here; use YouTube or Instagram for other creators.",
  x: "Reads any public account's recent posts. X bills per read, so these sources sync less often and pull fewer posts.",
};

function formatCount(value: number | null): string {
  if (value === null) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

export default async function ResearchPage() {
  const user = await requireUser();
  const active = await getActiveWorkspace();
  if (!active) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <p>No workspace is selected.</p>
      </main>
    );
  }

  const supabase = await createClient();
  const [snapshot, connections] = await Promise.all([
    getEntitlementSnapshot(supabase, user.id, active.id),
    listConnections(supabase, active.id),
  ]);

  const allowed = canUserDo(snapshot, { type: "use_research" });

  // Plan-locked: shown as an upgrade prompt, never a dead page — same rule as
  // the platform toggles.
  if (!allowed.allowed) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-16">
        <Link href="/dashboard" className="text-sm text-neutral-500 hover:text-neutral-300">
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-semibold">Research</h1>
        <div className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-6">
          <p className="text-sm font-medium text-amber-200">💎 Studio</p>
          <p className="mt-2 text-sm leading-relaxed text-neutral-300">
            Watch any creator&rsquo;s channel, and MarkedFox flags the videos
            that beat that channel&rsquo;s own average — the ones worth learning
            from. Pull the transcript, then generate hooks, an outline, or a
            full script from what worked.
          </p>
          <p className="mt-3 text-xs text-neutral-500">{allowed.reason}</p>
          <Link
            href="/pricing"
            className="mt-5 inline-block rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-neutral-200"
          >
            See plans
          </Link>
        </div>
      </main>
    );
  }

  const [sources, feed] = await Promise.all([
    listSources(supabase, active.id),
    listFeed(supabase, active.id, { limit: 60 }),
  ]);

  const watchingByPlatform = new Map<ResearchPlatform, number>();
  for (const source of sources) {
    watchingByPlatform.set(
      source.platform,
      (watchingByPlatform.get(source.platform) ?? 0) + 1,
    );
  }
  const connectedPlatforms = new Set(
    connections.filter((c) => c.status === "active").map((c) => c.platform),
  );

  const rows: ResearchPlatformRow[] = listResearchProviders().map((provider) => ({
    id: provider.platform,
    label: provider.label,
    watching: watchingByPlatform.get(provider.platform) ?? 0,
    configured: isResearchProviderConfigured(provider),
    connected: connectedPlatforms.has(provider.platform),
    requiresConnection: provider.capabilities.requiresConnection,
    ownContentOnly: provider.capabilities.ownContentOnly,
    meteredReads: provider.capabilities.meteredReads,
    note: NOTES[provider.platform],
  }));

  const model = configuredModel();
  const creditsLeft =
    snapshot.limits.researchCreditsPerMonth - snapshot.usage.researchCreditsThisMonth;

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-4 py-16">
      <header className="flex items-start justify-between gap-4">
        <div>
          <Link href="/dashboard" className="text-sm text-neutral-500 hover:text-neutral-300">
            ← Dashboard
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">Research</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Videos that beat their own channel&rsquo;s average, and the scripts
            you build from them.
          </p>
        </div>
        <p className="shrink-0 text-right text-xs text-neutral-500">
          {Math.max(0, creditsLeft)} of {snapshot.limits.researchCreditsPerMonth}
          <br />
          credits left this month
        </p>
      </header>

      {!model ? (
        <p className="rounded-lg border border-neutral-800 bg-neutral-950 px-4 py-3 text-xs text-neutral-500">
          Channel tracking and outlier scoring work now. Script generation turns
          on once an AI key is configured on this deployment.
        </p>
      ) : null}

      <AddSourceForm rows={rows} />

      {sources.length > 0 ? (
        <section>
          <h2 className="text-sm font-semibold">Watching</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {sources.map((source) => (
              <li
                key={source.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-neutral-800 bg-neutral-950/60 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{source.title}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {source.handle ? `${source.handle} · ` : ""}
                    {source.platform}
                    {source.baseline_views !== null
                      ? ` · typical ${formatCount(source.baseline_views)} (${source.baseline_sample} videos)`
                      : " · not enough videos for a baseline yet"}
                  </p>
                  {source.last_error ? (
                    <p className="mt-1 text-xs text-red-400">{source.last_error}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <form action={syncSourceAction}>
                    <input type="hidden" name="source_id" value={source.id} />
                    <button
                      type="submit"
                      className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs transition hover:bg-neutral-900"
                    >
                      Sync
                    </button>
                  </form>
                  <form action={deleteSourceAction}>
                    <input type="hidden" name="source_id" value={source.id} />
                    <button
                      type="submit"
                      aria-label={`Stop watching ${source.title}`}
                      className="rounded px-2 py-1 text-neutral-600 transition hover:bg-neutral-800 hover:text-red-300"
                    >
                      ×
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="text-sm font-semibold">
          Outliers
          <span className="ml-2 font-normal text-neutral-500">
            ranked by multiple of their own channel&rsquo;s median
          </span>
        </h2>

        {feed.length === 0 ? (
          <p className="mt-3 rounded-lg border border-neutral-800 bg-neutral-950 px-4 py-6 text-center text-sm text-neutral-500">
            Add a channel above. Its videos appear here within a minute, ranked
            by how far each beat that channel&rsquo;s own average.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {feed.map((video) => {
              const strong = (video.outlier_score ?? 0) >= OUTLIER_THRESHOLD;
              return (
                <li
                  key={video.id}
                  className={`flex items-start gap-4 rounded-lg border px-4 py-3 ${
                    strong
                      ? "border-emerald-900/60 bg-emerald-950/10"
                      : "border-neutral-800 bg-neutral-950/60"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/dashboard/research/${video.id}`}
                      className="line-clamp-2 text-sm font-medium hover:underline"
                    >
                      {video.title}
                    </Link>
                    <p className="mt-1 text-xs text-neutral-500">
                      {video.source.title} · {video.source.platform} ·{" "}
                      {formatCount(video.view_count)}{" "}
                      {video.source.platform === "instagram" ? "likes" : "views"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-right text-xs ${
                      strong ? "text-emerald-300" : "text-neutral-500"
                    }`}
                  >
                    {describeScore(
                      video.outlier_score === null ? null : Number(video.outlier_score),
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
