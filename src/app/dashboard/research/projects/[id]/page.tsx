import type { Metadata } from "next";

import Link from "next/link";
import { notFound } from "next/navigation";

import { Page } from "@/components/ui";
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
    <Page width="max-w-[720px]">
      <header>
        <Link
          href="/dashboard/research/projects"
          className="text-[13.5px] font-medium text-faint transition hover:text-ink"
        >
          ← Projects
        </Link>
        <h1 className="font-display mt-2 text-[26px]/[32px] font-bold tracking-[-0.02em]">
          {project.name}
        </h1>
        {project.description ? (
          <p className="mt-1.5 text-[14.5px]/[22px] text-muted">
            {project.description}
          </p>
        ) : null}
      </header>

      {items.length === 0 ? (
        <p className="rounded-lg border border-line bg-panel px-4 py-6 text-center text-[14.5px] text-faint">
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
                <h2 className="text-[14.5px] font-semibold">
                  {stage.label}
                  <span className="ml-2 font-normal text-faint">
                    {stageItems.length}
                  </span>
                </h2>
                <ul className="mt-3 flex flex-col gap-2">
                  {stageItems.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-start justify-between gap-4 rounded-lg border border-line bg-panel px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/dashboard/research/${item.video.id}`}
                          className="line-clamp-2 text-[14.5px] font-medium hover:underline"
                        >
                          {item.video.title}
                        </Link>
                        <p className="mt-1 text-[13px] text-faint">
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
                            className="rounded-lg border border-line bg-chip px-2 py-1.5 text-[13px] outline-none"
                          >
                            {STAGES.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="submit"
                            className="ml-1 rounded-lg border border-line-strong px-2 py-1.5 text-[13px] transition hover:bg-chip"
                          >
                            Move
                          </button>
                        </form>
                        <form action={removeProjectItemAction}>
                          <input type="hidden" name="item_id" value={item.id} />
                          <button
                            type="submit"
                            aria-label="Remove from project"
                            className="rounded px-2 py-1 text-faint transition hover:bg-chip hover:text-danger"
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
    </Page>
  );
}
