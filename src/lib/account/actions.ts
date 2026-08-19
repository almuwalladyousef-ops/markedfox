"use server";

import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { DELETE_CONFIRMATION_WORD } from "./constants";
import { deleteAccount } from "./delete-account";

export type DeleteAccountFormState = { message?: string };

// Self-serve account deletion. Typing the word is the only guard because the
// session already proves who is asking; the action deletes the signed-in
// user and nobody else, whatever the form carries.
export async function deleteOwnAccountAction(
  _previous: DeleteAccountFormState,
  formData: FormData,
): Promise<DeleteAccountFormState> {
  const user = await requireUser();

  const typed = String(formData.get("confirm") ?? "").trim();
  if (typed !== DELETE_CONFIRMATION_WORD) {
    return { message: `Type ${DELETE_CONFIRMATION_WORD} to confirm.` };
  }

  try {
    await deleteAccount(user.id);
  } catch (error) {
    console.error(`delete-account: failed for ${user.id}:`, error);
    return {
      message:
        "Something went wrong deleting your account. Nothing was removed — try again, or email support@markedfox.com.",
    };
  }

  // The user row is gone; clear the session cookies so the browser is not
  // holding a JWT for an account that no longer exists.
  const supabase = await createClient();
  await supabase.auth.signOut().catch(() => undefined);
  redirect("/account-deleted");
}
