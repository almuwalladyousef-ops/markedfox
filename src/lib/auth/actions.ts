"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { getSiteUrl } from "./site-url";
import {
  parseIntendedPlan,
  safeRedirectPath,
  validateCredentials,
  validateEmail,
  validatePassword,
  type FieldErrors,
} from "./validation";

// Shape returned to every form via useActionState. `errors` keys map to input
// names; `message` is the form-level line.
export type AuthFormState = {
  message?: string;
  errors?: FieldErrors;
  success?: boolean;
};

// Every one of these actions is a public POST endpoint — the 'use server'
// directive publishes it, and rendering the form on a page is not a security
// boundary. So each validates its own input and none trusts the caller.

export async function signUp(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = validateCredentials(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  const supabase = await createClient();
  const siteUrl = await getSiteUrl();

  // Which paid plan the pricing page sent them here wanting, if any. Kept on
  // the auth user so the Phase 6 checkout can offer it first; it grants
  // nothing by itself — entitlements come only from `subscriptions`.
  const intendedPlan = parseIntendedPlan(formData.get("plan"));

  const { data, error } = await supabase.auth.signUp({
    email: parsed.value.email,
    password: parsed.value.password,
    options: {
      emailRedirectTo: `${siteUrl}/auth/confirm`,
      ...(intendedPlan ? { data: { intended_plan: intendedPlan } } : {}),
    },
  });

  if (error) {
    return { message: error.message };
  }

  const planNote = intendedPlan
    ? ` You chose ${intendedPlan === "pro" ? "Pro" : "Studio"} — your account starts on Free, and you will be able to upgrade once billing opens.`
    : "";

  // Account enumeration guard. With email confirmation on, Supabase answers a
  // signup for an existing address with a success-shaped response carrying an
  // empty `identities` array, so that a stranger cannot use this form to learn
  // who has an account. Mirroring the ordinary message keeps that property —
  // the real owner still gets an email, and nobody else learns anything.
  if (data.user && data.user.identities?.length === 0) {
    return {
      success: true,
      message:
        "Check your email for a confirmation link. If you already have an account, we sent a sign-in reminder instead." +
        planNote,
    };
  }

  return {
    success: true,
    message: "Check your email for a confirmation link to finish signing up." + planNote,
  };
}

export async function signIn(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = validateCredentials(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.value.email,
    password: parsed.value.password,
  });

  if (error) {
    // One message for wrong password, unknown address, and unconfirmed email.
    // Distinguishing them would turn this form into an account-existence
    // oracle, and the user's next step is the same in all three cases.
    return { message: "That email and password combination did not work." };
  }

  redirect(safeRedirectPath(formData.get("next")?.toString()));
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordReset(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = validateEmail(formData.get("email"));
  if (!email.ok) return { errors: email.errors };

  const supabase = await createClient();
  const siteUrl = await getSiteUrl();

  // Errors are deliberately swallowed. The response must not differ between a
  // registered and an unregistered address, so the same confirmation shows
  // either way and real failures go to the server log.
  const { error } = await supabase.auth.resetPasswordForEmail(email.value, {
    redirectTo: `${siteUrl}/auth/confirm?next=/update-password`,
  });
  if (error) {
    console.error("Password reset request failed:", error.message);
  }

  return {
    success: true,
    message:
      "If that address has an account, a password reset link is on its way.",
  };
}

export async function updatePassword(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const password = validatePassword(formData.get("password"));
  if (!password.ok) return { errors: password.errors };

  const confirmation = formData.get("confirm_password");
  if (password.value !== confirmation) {
    return { errors: { confirm_password: "The two passwords do not match." } };
  }

  const supabase = await createClient();

  // Requires the recovery session the confirmation route established. Without
  // it there is no user to update and Supabase refuses — which is the check
  // that stops anyone reaching this action directly.
  const { error } = await supabase.auth.updateUser({ password: password.value });
  if (error) {
    return { message: error.message };
  }

  redirect("/dashboard");
}
