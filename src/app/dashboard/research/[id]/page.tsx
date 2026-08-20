import type { Metadata } from "next";

import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import { fetchTranscriptAction } from "@/lib/research/actions";
import { configuredModel } from "@/lib/research/generate";
import { describeScore } from "@/lib/research/outlier";
import { getResearchProvider } from "@/lib/research/providers";
import {
  getSource,
  getTranscript,
  getVideo,
  listScripts,
} from "@/lib/research/store";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/store";

import { GeneratePanel } from "./generate-panel";

export const metadata: Metadata = { title: "Video · MarkedFox" };

// One outlier, everything known about it, and the way to turn it into a script.

export default async function ResearchVideoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const active = await getActiveWorkspace();
  if (!active) notFound();

  const supabase = await createClient();
  // RLS scopes this: another tenant's video id simply returns nothing.
  const video = await getVideo(supabase, id);
  if (!video) notFound();

  const [source, transcript, snapshot, scripts] = await Promise.all([
    getSource(supabase, video.source_id),
    getTranscript(supabase, id),
    getEntitlementSnapshot(supabase, user.id, active.id),
    listScripts(supabase, active.id, 10),
  ]);

  const allowed = canUserDo(snapshot, { type: "use_research" });
  if (!allowed.allowed) notFound();

  const provider = source ? getResearchProvider(source.platform) : null;
  const transcriptsPossible = Boolean(provider?.capabilities.transcripts);
  const creditsLeft =
    snapshot.limits.researchCreditsPerMonth -
    snapshot.usage.researchCreditsThisMonth;
  const forThisVideo = scripts.filter((s) => s.video_id === id);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-4 py-16">
      <Link
        href="/dashboard/research"
        className="text-sm text-neutral-500 hover:text-neutral-300"
      >
        ← Research
      </Link>

      <header>
        <h1 className="text-xl font-semibold leading-snug">{video.title}</h1>
        <p className="mt-2 text-sm text-neutral-400">
          {source?.title ?? "Unknown channel"} · {source?.platform}
        </p>
        <p className="mt-1 text-sm text-emerald-300">
          {describeScore(
            video.outlier_score === null ? null : Number(video.outlier_score),
          )}
          {video.baseline_views !== null ? (
            <span className="text-neutral-500">
              {" "}
              — this channel normally does{" "}
              {video.baseline_views.toLocaleString()}
            </span>
          ) : null}
        </p>
        <a
          href={video.url}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-3 inline-block text-xs text-neutral-500 underline hover:text-neutral-300"
        >
          Open on {source?.platform ?? "the platform"} ↗
        </a>
      </header>

      <section className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-5">
        <h2 className="text-sm font-semibold">Transcript</h2>
        {transcript?.origin === "captions" ? (
          <p className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-neutral-400">
            {transcript.text}
          </p>
        ) : transcript?.origin === "unavailable" ? (
          <p className="mt-2 text-xs text-neutral-500">
            This video has no captions to pull. The generator still works from
            the title, description, and how it performed.
          </p>
        ) : !transcriptsPossible ? (
          <p className="mt-2 text-xs text-neutral-500">
            {source?.platform ?? "This platform"} serves no transcripts through
            its API.
          </p>
        ) : (
          <form action={fetchTranscriptAction} className="mt-3">
            <input type="hidden" name="video_id" value={id} />
            <button
              type="submit"
              className="rounded-lg border border-neutral-700 px-3 py-2 text-xs font-medium transition hover:bg-neutral-900"
            >
              Fetch transcript
            </button>
            <span className="ml-2 text-xs text-neutral-600">
              Free — no credit is used.
            </span>
          </form>
        )}
      </section>

      <GeneratePanel
        videoId={id}
        enabled={configuredModel() !== null}
        creditsLeft={creditsLeft}
      />

      {forThisVideo.length > 0 ? (
        <section>
          <h2 className="text-sm font-semibold">Generated from this video</h2>
          <ul className="mt-3 flex flex-col gap-3">
            {forThisVideo.map((script) => (
              <li
                key={script.id}
                className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-4"
              >
                <p className="text-xs text-neutral-500">
                  {script.kind}
                  {script.topic ? ` · ${script.topic}` : ""} ·{" "}
                  {new Date(script.created_at).toLocaleString()}
                </p>
                <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-relaxed text-neutral-200">
                  {script.output}
                </pre>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
