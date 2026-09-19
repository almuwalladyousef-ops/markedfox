"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { authErrorMessage, logAuthError } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/validation";
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

// ── profile and preferences ────────────────────────────────────────────────

export type ProfileFormState = { message?: string; ok?: boolean };

/**
 * Name, and the address the account signs in with.
 *
 * Changing the email goes through Supabase, which sends a confirmation to the
 * new address and does not move the account until it is clicked. That is
 * deliberate and worth saying on screen: a typo here would otherwise lock
 * somebody out of the inbox that owns their platform tokens.
 */
export async function updateProfileAction(
  _previous: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const user = await requireUser();
  const supabase = await createClient();

  const name = String(formData.get("display_name") ?? "").trim().slice(0, 80);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  const { error } = await supabase
    .from("users")
    .update({ display_name: name || null })
    .eq("id", user.id);
  if (error) return { message: "Could not save that name." };

  if (email && email !== (user.email ?? "").toLowerCase()) {
    const { error: authError } = await supabase.auth.updateUser({ email });
    if (authError) {
      // The provider's wording never reaches the screen — a spent project
      // email quota says "email rate limit exceeded", which names nothing the
      // person can act on. See lib/auth/errors.ts.
      logAuthError("email change", authError);
      return { message: authErrorMessage(authError) };
    }
    revalidatePath("/dashboard/settings/email");
    return {
      ok: true,
      message: `Check ${email} — the address only changes once you click the link we sent there.`,
    };
  }

  revalidatePath("/dashboard/settings/email");
  return { ok: true, message: "Saved." };
}

/** The avatar, already uploaded to object storage by the browser. Only the
 *  URL reaches the server, and only one from our own bucket is accepted — an
 *  arbitrary URL here would let somebody point every page that renders their
 *  avatar at a host they control. */
export async function updateAvatarAction(
  _previous: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const user = await requireUser();
  const url = String(formData.get("avatar_url") ?? "").trim();

  const base = process.env.R2_PUBLIC_BASE_URL;
  if (url && (!base || !url.startsWith(base))) {
    return { message: "That image did not come from an upload here." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("users")
    .update({ avatar_url: url || null })
    .eq("id", user.id);
  if (error) return { message: "Could not save that picture." };

  revalidatePath("/dashboard/settings/picture");
  revalidatePath("/dashboard");
  return { ok: true, message: url ? "Picture updated." : "Picture removed." };
}

/** One of the ordering preferences. The whole list is posted rather than a
 *  move instruction, so two tabs cannot interleave into an order neither of
 *  them asked for. */
export async function updatePreferenceAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const key = String(formData.get("key") ?? "");
  if (key !== "platformOrder" && key !== "postTypeOrder") return;

  const values = formData.getAll("value").map(String);
  const supabase = await createClient();
  const { data } = await supabase
    .from("users")
    .select("preferences")
    .eq("id", user.id)
    .maybeSingle();

  const current = ((data?.preferences ?? {}) as Record<string, unknown>) ?? {};
  await supabase
    .from("users")
    .update({ preferences: { ...current, [key]: values } })
    .eq("id", user.id);

  revalidatePath("/dashboard/settings/platform-order");
  revalidatePath("/dashboard/settings/post-type-order");
  revalidatePath("/dashboard");
}

/**
 * Change the password from inside the app.
 *
 * Separate from `updatePassword` in auth/actions, which exists for the reset
 * link and redirects to the dashboard when it succeeds — the right ending for
 * somebody who arrived from an email and the wrong one for somebody who is
 * already here and wants to stay on the page they were on.
 *
 * Supabase does not require the current password for a signed-in change; the
 * session is the proof. Worth saying on screen rather than adding a field that
 * is not actually checked.
 */
export async function changePasswordAction(
  _previous: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  await requireUser();

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { message: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (password !== confirm) {
    return { message: "The two passwords do not match." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    logAuthError("password change", error);
    return { message: authErrorMessage(error) };
  }
  return { ok: true, message: "Password changed. Other sessions stay signed in." };
}
