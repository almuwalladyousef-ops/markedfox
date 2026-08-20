"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// Cancels a post that has not been claimed yet. The `.eq("status",
// "scheduled")` is what makes this safe against a race with the timer: a post
// the tick has already moved to `publishing` matches zero rows and stays on
// its way out, rather than being marked canceled after it went live.
export async function cancelPostAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const postId = String(formData.get("post_id") ?? "");
  if (!postId) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("scheduled_posts")
    .update({ status: "canceled" })
    .eq("id", postId)
    .eq("user_id", user.id)
    .eq("status", "scheduled");
  if (error) throw error;

  revalidatePath("/dashboard/posts");
}

// Deleting a draft is a real delete, not a status change: a draft has no
// history worth keeping and nothing downstream refers to it. Scoped to
// `status = "draft"` for the same reason cancel is scoped to `scheduled` — a
// row that became a real post between the page render and the click must not
// be deleted by a button that said "draft".
export async function deleteDraftAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const postId = String(formData.get("post_id") ?? "");
  if (!postId) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("scheduled_posts")
    .delete()
    .eq("id", postId)
    .eq("user_id", user.id)
    .eq("status", "draft");
  if (error) throw error;

  revalidatePath("/dashboard/drafts");
}
