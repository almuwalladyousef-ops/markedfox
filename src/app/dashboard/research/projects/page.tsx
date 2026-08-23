import type { Metadata } from "next";

import Link from "next/link";
import { notFound } from "next/navigation";

import { Icon } from "@/components/icons";
import { Page, PageHeader, Pill } from "@/components/ui";
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
    <Page width="max-w-[980px]">
      <PageHeader
        title="Projects"
        subtitle="Collect the ideas worth acting on, and track which ones you actually made."
      />

      <NewProjectForm />

      {projects.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center text-[14.5px] text-faint">
          No projects yet. Create one, then save outliers into it from the feed.
        </p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3.5">
          {projects.map((project) => (
            <li
              key={project.id}
              className="flex items-start gap-4 rounded-2xl border border-line bg-panel px-5 py-4 transition-[border-color] duration-150 hover:border-accent"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={`/dashboard/research/projects/${project.id}`}
                    className="font-display text-[16px] font-bold tracking-[-0.01em] text-ink hover:underline"
                  >
                    {project.name}
                  </Link>
                  <Pill tone="neutral">{project.item_count} saved</Pill>
                </div>
                {project.description ? (
                  <p className="mt-2 text-[13.5px]/[20px] text-pretty text-muted">
                    {project.description}
                  </p>
                ) : null}
              </div>
              <form action={deleteProjectAction}>
                <input type="hidden" name="project_id" value={project.id} />
                <button
                  type="submit"
                  aria-label={`Delete ${project.name}`}
                  className="rounded-lg p-1.5 text-faint transition-[background,color] duration-150 hover:bg-chip hover:text-danger"
                >
                  <Icon name="close" className="h-3.5 w-3.5" />
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
