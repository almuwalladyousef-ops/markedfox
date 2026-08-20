import type { Metadata } from "next";

import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import {
  removeProjectItemAction,
  setStageAction,
} from "@/lib/research/actions";
import { describeScore } from "@/lib/research/outlier";
import { listProjectItems, listProjects } from "@/lib/research/store";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/store";

export const metadata: Metadata = { title: "Project · MarkedFox" };

// Deliberately few stages. A pipeline with ten columns is a pipeline nobody
// updates, and a stale pipeline is worse than none — it lies about what is done.
const STAGES = [
  { id: "saved", label: "Saved" },
  { id: "scripted", label: "Scripted" },
  { id: "filmed", label: "Filmed" },
  { id: "published", label: "Published" },
  { id: "dropped", label: "Dropped" },
] as const;

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const active = await getActiveWorkspace();
  if (!active) notFound();

  const supabase = await createClient();
  const snapshot = await getEntitlementSnapshot(supabase, user.id, active.id);
  if (!canUserDo(snapshot, { type: "use_research" }).allowed) notFound();

  // RLS scopes both: another tenant's project id simply is not in the list.
  const projects = await listProjects(supabase, active.id);
  const project = projects.find((p) => p.id === id);
  if (!project) notFound();

  const items = await listProjectItems(supabase, id);
  const byStage = new Map<string, typeof items>();
  for (const item of items) {
    const list = byStage.get(item.stage) ?? [];
    list.push(item);
    byStage.set(item.stage, list);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-4 py-16">
      <header>
        <Link
          href="/dashboard/research/projects"
          className="text-sm text-neutral-500 hover:text-neutral-300"
        >
          ← Projects
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{project.name}</h1>
        {project.description ? (
          <p className="mt-1 text-sm text-neutral-400">{project.description}</p>
        ) : null}
      </header>

      {items.length === 0 ? (
        <p className="rounded-lg border border-neutral-800 bg-neutral-950 px-4 py-6 text-center text-sm text-neutral-500">
          Nothing saved yet. Open an outlier from{" "}
          <Link href="/dashboard/research" className="underline">
            the feed
          </Link>{" "}
          and save it here.
        </p>
      ) : (
        <div className="flex flex-col gap-8">
          {STAGES.map((stage) => {
            const stageItems = byStage.get(stage.id) ?? [];
            if (stageItems.length === 0) return null;

            return (
              <section key={stage.id}>
                <h2 className="text-sm font-semibold">
                  {stage.label}
                  <span className="ml-2 font-normal text-neutral-500">
                    {stageItems.length}
                  </span>
                </h2>
                <ul className="mt-3 flex flex-col gap-2">
                  {stageItems.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-start justify-between gap-4 rounded-lg border border-neutral-800 bg-neutral-950/60 px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/dashboard/research/${item.video.id}`}
                          className="line-clamp-2 text-sm font-medium hover:underline"
                        >
                          {item.video.title}
                        </Link>
                        <p className="mt-1 text-xs text-neutral-500">
                          {item.video.source.title} ·{" "}
                          {describeScore(
                            item.video.outlier_score === null
                              ? null
                              : Number(item.video.outlier_score),
                            item.video.source.baseline_sample,
                          )}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <form action={setStageAction}>
                          <input type="hidden" name="item_id" value={item.id} />
                          <select
                            name="stage"
                            defaultValue={item.stage}
                            className="rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs outline-none"
                          >
                            {STAGES.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="submit"
                            className="ml-1 rounded-lg border border-neutral-700 px-2 py-1.5 text-xs transition hover:bg-neutral-900"
                          >
                            Move
                          </button>
                        </form>
                        <form action={removeProjectItemAction}>
                          <input type="hidden" name="item_id" value={item.id} />
                          <button
                            type="submit"
                            aria-label="Remove from project"
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
            );
          })}
        </div>
      )}
    </main>
  );
}
