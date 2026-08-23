import type { Metadata } from "next";

import { Icon, PlanDiamond } from "@/components/icons";
import { Card, Notice, Pill, cx } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import { createClient } from "@/lib/supabase/server";
import { switchWorkspaceAction } from "@/lib/workspaces/actions";
import { getActiveWorkspace, listWorkspaces } from "@/lib/workspaces/store";

import { WorkspaceTile } from "../../workspace-switcher";
import { Pane } from "../pane";

export const metadata: Metadata = { title: "Workspaces · MarkedFox" };

// A workspace is one brand or one client. Connected accounts belong to it;
// posts, DM sends and credits are pooled across every workspace the person
// owns — which is the whole reason this pane says so rather than leaving
// somebody to infer it from two numbers that disagree.
export default async function WorkspacesPane() {
  const user = await requireUser();
  const [workspaces, active] = await Promise.all([
    listWorkspaces(),
    getActiveWorkspace(),
  ]);
  if (!active) return <Notice>No workspace is selected.</Notice>;

  const supabase = await createClient();
  const snapshot = await getEntitlementSnapshot(supabase, user.id, active.id);
  const decision = canUserDo(snapshot, { type: "create_workspace" });
  const max = snapshot.limits.maxWorkspaces;

  return (
    <Pane
      title="Workspaces"
      blurb="One per brand or client. Connected accounts belong to a workspace; posts, DM sends and research credits are pooled across all of them."
      actions={
        <Pill tone={decision.allowed ? "neutral" : "warn"}>
          {workspaces.length}
          {max === null ? "" : ` of ${max}`}
        </Pill>
      }
    >
      <ul className="flex flex-col gap-3">
        {workspaces.map((workspace) => {
          const isActive = workspace.id === active.id;
          return (
            <li key={workspace.id}>
              <Card
                className={cx(
                  "flex flex-wrap items-center gap-4 px-5 py-4",
                  isActive && "border-accent",
                )}
              >
                <WorkspaceTile name={workspace.name} size={40} radius={12} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-ink">
                    {workspace.name}
                  </p>
                  <p className="mt-0.5 text-[13px] text-faint">
                    {workspace.is_default ? "Your first workspace" : "Workspace"}
                  </p>
                </div>
                {isActive ? (
                  <Pill tone="accent">Active</Pill>
                ) : (
                  <form action={switchWorkspaceAction}>
                    <input type="hidden" name="workspace_id" value={workspace.id} />
                    <button
                      type="submit"
                      className="rounded-[10px] border border-line px-3.5 py-2 text-[13px] font-semibold text-ink transition-[border-color] duration-150 hover:border-accent"
                    >
                      Switch to
                    </button>
                  </form>
                )}
              </Card>
            </li>
          );
        })}
      </ul>

      {/* Never a hidden or greyed-out row: past the plan's count it still
          shows, and it says what the next plan gives. */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-line-strong px-5 py-4">
        <Icon name="plus" className="h-[18px] w-[18px] text-muted" />
        <span className="text-[14.5px] font-semibold text-ink">New workspace</span>
        <span className="text-[13.5px] text-muted">
          {decision.allowed
            ? "Create one from the switcher at the top of the sidebar."
            : decision.reason}
        </span>
        {decision.allowed ? null : (
          <span className="ml-auto">
            <PlanDiamond />
          </span>
        )}
      </div>
    </Pane>
  );
}
