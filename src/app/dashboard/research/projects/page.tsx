import type { Metadata } from "next";

import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import { deleteProjectAction } from "@/lib/research/actions";
import { listProjects } from "@/lib/research/store";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/store";

import { NewProjectForm } from "./new-project-form";

export const metadata: Metadata = { title: "Projects · MarkedFox" };

// Projects are the pipeline between "this video is worth copying" and "I
// filmed it". Without one, the outlier feed is a firehose you scroll and
// forget — which is the difference between a research tool and a research
// habit.

export default async function ResearchProjectsPage() {
  const user = await requireUser();
  const active = await getActiveWorkspace();
  if (!active) notFound();

  const supabase = await createClient();
  const snapshot = await getEntitlementSnapshot(supabase, user.id, active.id);
  if (!canUserDo(snapshot, { type: "use_research" }).allowed) notFound();

  const projects = await listProjects(supabase, active.id);

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="Collect the ideas worth acting on, and track which ones you actually made."
      />

      <NewProjectForm />

      {projects.length === 0 ? (
        <p className="rounded-lg border border-neutral-800 bg-neutral-950 px-4 py-6 text-center text-sm text-neutral-500">
          No projects yet. Create one, then save outliers into it from the feed.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {projects.map((project) => (
            <li
              key={project.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-neutral-800 bg-neutral-950/60 px-4 py-3"
            >
              <div className="min-w-0">
                <Link
                  href={`/dashboard/research/projects/${project.id}`}
                  className="text-sm font-medium hover:underline"
                >
                  {project.name}
                </Link>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {project.item_count} saved
                  {project.description ? ` · ${project.description}` : ""}
                </p>
              </div>
              <form action={deleteProjectAction}>
                <input type="hidden" name="project_id" value={project.id} />
                <button
                  type="submit"
                  aria-label={`Delete ${project.name}`}
                  className="rounded px-2 py-1 text-neutral-600 transition hover:bg-neutral-800 hover:text-red-300"
                >
                  ×
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
