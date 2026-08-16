import "server-only";

import { cookies } from "next/headers";

import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import { createClient } from "@/lib/supabase/server";

// Workspaces are the tenancy unit the user actually sees. Connected accounts
// live in one; posts, DM sends, and credits are pooled across all of them.
//
// Which workspace a request acts in comes from a cookie, always re-validated
// against the database — a tampered cookie selects nothing, because the lookup
// runs through the user's own client and RLS refuses rows they do not own.

export const ACTIVE_WORKSPACE_COOKIE = "mf_workspace";

export type Workspace = {
  id: string;
  name: string;
  is_default: boolean;
  created_at: string;
};

export async function listWorkspaces(): Promise<Workspace[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspaces")
    .select("id, name, is_default, created_at")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Workspace[];
}

// The workspace this request acts in: the cookie if it names one the user owns,
// otherwise their default, otherwise the oldest. Never trusts the cookie alone.
export async function getActiveWorkspace(): Promise<Workspace | null> {
  const workspaces = await listWorkspaces();
  if (workspaces.length === 0) return null;

  const cookieStore = await cookies();
  const requested = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value;
  const match = requested
    ? workspaces.find((w) => w.id === requested)
    : undefined;

  return match ?? workspaces.find((w) => w.is_default) ?? workspaces[0];
}

export type CreateWorkspaceResult =
  | { ok: true; workspace: Workspace }
  | { ok: false; reason: string; code: string };

// Creating a workspace is a plan decision, so it goes through canUserDo like
// every other costed action rather than trusting the UI to have hidden a button.
export async function createWorkspace(
  userId: string,
  name: string,
): Promise<CreateWorkspaceResult> {
  const trimmed = name.trim();
  if (!trimmed) {
    return { ok: false, reason: "Give the workspace a name.", code: "invalid_name" };
  }
  if (trimmed.length > 60) {
    return { ok: false, reason: "That name is too long.", code: "invalid_name" };
  }

  const supabase = await createClient();
  const active = await getActiveWorkspace();
  // The snapshot needs some workspace for its per-workspace figure; the
  // workspace cap it is consulted for here is pooled, so any is fine.
  const snapshot = await getEntitlementSnapshot(
    supabase,
    userId,
    active?.id ?? "",
  );

  const decision = canUserDo(snapshot, { type: "create_workspace" });
  if (!decision.allowed) {
    return { ok: false, reason: decision.reason, code: decision.code };
  }

  const { data, error } = await supabase
    .from("workspaces")
    .insert({ owner_id: userId, name: trimmed })
    .select("id, name, is_default, created_at")
    .single();
  if (error) throw error;

  return { ok: true, workspace: data as unknown as Workspace };
}
