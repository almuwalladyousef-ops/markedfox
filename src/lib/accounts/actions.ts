"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/store";

import { syncWorkspace } from "./sync";

// Refreshing the home screen on demand.
//
// Both actions run through the user's own client, so RLS decides which
// connections exist to read — a workspace id is never taken from the form.

/** The refresh button. Ignores the throttle, because the person pressing it
 *  just posted something and wants to see it. Metered platforms (X) are
 *  included only when the form asks, since each read costs money. */
export async function refreshAccountsAction(formData: FormData): Promise<void> {
  await requireUser();
  const active = await getActiveWorkspace();
  if (!active) return;

  const supabase = await createClient();
  await syncWorkspace(supabase, active.id, {
    force: true,
    includeMetered: formData.get("include_metered") === "1",
  });
  revalidatePath("/dashboard");
}

/** The first-load fill. Throttled, never metered: an account connected a
 *  moment ago has nothing cached yet, and waiting six hours for the sweep to
 *  reach it would make a new user's home screen look broken. */
export async function fillAccountsAction(): Promise<void> {
  await requireUser();
  const active = await getActiveWorkspace();
  if (!active) return;

  const supabase = await createClient();
  await syncWorkspace(supabase, active.id, {});
  revalidatePath("/dashboard");
}
