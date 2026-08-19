"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { ConnectionNotFoundError, disconnectConnection } from "./disconnect";

// Disconnect one connected account. The form posts the connection id; RLS on
// the user-scoped client means an id that is not theirs is simply not found.
export async function disconnectAccountAction(formData: FormData): Promise<void> {
  await requireUser();
  const connectionId = String(formData.get("connection_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(connectionId)) {
    redirect("/dashboard?disconnect_error=1");
  }

  const supabase = await createClient();
  let name = "";
  try {
    const { row } = await disconnectConnection(supabase, connectionId);
    name = row.platform_account_name ?? row.platform;
  } catch (error) {
    if (error instanceof ConnectionNotFoundError) {
      redirect("/dashboard?disconnect_error=1");
    }
    throw error;
  }

  revalidatePath("/dashboard");
  redirect(`/dashboard?disconnected=${encodeURIComponent(name)}`);
}
