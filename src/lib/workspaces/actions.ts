"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { requireUser } from "@/lib/auth/session";

import {
  ACTIVE_WORKSPACE_COOKIE,
  createWorkspace,
  listWorkspaces,
} from "./store";

export type WorkspaceFormState = { message?: string; success?: boolean };

export async function createWorkspaceAction(
  _previous: WorkspaceFormState,
  formData: FormData,
): Promise<WorkspaceFormState> {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "");

  const result = await createWorkspace(user.id, name);
  if (!result.ok) return { message: result.reason };

  // Switch to the new workspace immediately — creating one and staying put is
  // never what the user meant.
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, result.workspace.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/dashboard");
  return { success: true, message: `Created ${result.workspace.name}.` };
}

export async function switchWorkspaceAction(formData: FormData): Promise<void> {
  await requireUser();
  const workspaceId = String(formData.get("workspace_id") ?? "");

  // Only accept an id the user actually owns; the list comes back through RLS,
  // so a forged value simply will not be found.
  const owned = await listWorkspaces();
  if (!owned.some((w) => w.id === workspaceId)) return;

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/dashboard");
}
