"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/session";
import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
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

  revalidatePath("/dashboard/calendar");
}

// Moving a scheduled post to a different time. Scoped exactly like cancel: a
// post the tick has already claimed matches zero rows, so a new time can never
// be written over a post that is already going out.
export async function reschedulePostAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const postId = String(formData.get("post_id") ?? "");
  const scheduledFor = String(formData.get("scheduled_for") ?? "");
  if (!postId || !scheduledFor) return;

  const when = new Date(scheduledFor);
  // A time in the past would publish on the very next tick, which is not what
  // anybody means by "edit time" — it is what "publish now" is for.
  if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) return;

  const supabase = await createClient();

  // The same gate the composer's Schedule button is behind. It matters here
  // for exactly one case: someone who scheduled posts on a paid plan and has
  // since dropped to Free. Those posts still go out — they were committed
  // under the plan that allowed them — but pushing one further into the
  // future is asking the bucket to hold its media for longer, which is the
  // thing Free does not include.
  const { data: post } = await supabase
    .from("scheduled_posts")
    .select("workspace_id")
    .eq("id", postId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!post) return;
  const snapshot = await getEntitlementSnapshot(
    supabase,
    user.id,
    String(post.workspace_id),
  );
  if (!canUserDo(snapshot, { type: "schedule_post" }).allowed) return;

  const { error } = await supabase
    .from("scheduled_posts")
    .update({ scheduled_for: when.toISOString() })
    .eq("id", postId)
    .eq("user_id", user.id)
    .eq("status", "scheduled");
  if (error) throw error;

  revalidatePath("/dashboard/calendar");
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
