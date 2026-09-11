"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { consumeAll, resetRateLimit } from "@/lib/rate-limit/limit";
import { clientIpFrom } from "@/lib/rate-limit/policy";
import { createClient } from "@/lib/supabase/server";

import { getSiteUrl } from "./site-url";
import {
  INTENDED_PLAN_NAMES,
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
//
// They are also rate limited, for the same reason: a public endpoint that
// checks a password, or sends mail to any address the caller names, is one an
// attacker can call as fast as their connection allows. The limits live in
// lib/rate-limit/policy.ts; refusals are worded as "wait a moment", never as
// "you are blocked", and they never reveal whether the address exists.

/** The caller's address, or null behind a proxy that did not forward one. */
async function callerIp(): Promise<string | null> {
  return clientIpFrom(await headers());
}

export async function signUp(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = validateCredentials(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  const limited = await consumeAll([
    { name: "signUpIp", subject: await callerIp() },
  ]);
  if (!limited.allowed) return { message: limited.message ?? undefined };

  const supabase = await createClient();
  const siteUrl = await getSiteUrl();

  // Which paid plan the pricing page sent them here wanting, if any. Kept on
  // the auth user so the Phase 6 checkout can offer it first; it grants
  // nothing by itself — entitlements come only from `subscriptions`.
  const intendedPlan = parseIntendedPlan(formData.get("plan"));

  const { error } = await supabase.auth.signUp({
    email: parsed.value.email,
    password: parsed.value.password,
    options: {
      emailRedirectTo: `${siteUrl}/auth/confirm?flow=signup`,
      ...(intendedPlan ? { data: { intended_plan: intendedPlan } } : {}),
    },
  });

  if (error) {
    return { message: error.message };
  }

  const planNote = intendedPlan
    ? ` You chose ${INTENDED_PLAN_NAMES[intendedPlan]} — your account starts on Free, and you will be able to upgrade once billing opens.`
    : "";

  // Account enumeration guard. With email confirmation on, Supabase answers a
  // signup for an already-confirmed address with a success-shaped response
  // carrying an empty `identities` array — and sends NO email at all. So the
  // answer must be one message, word for word, whichever case this is: a
  // different line for the existing-account case would tell a stranger who
  // has an account. It used to be different, and it also promised a
  // "sign-in reminder" Supabase never sends, which left a real person waiting
  // on an inbox that stayed empty. The line below is true in both cases.
  return {
    success: true,
    message:
      "Check your email for a confirmation link to finish signing up. No email after a few minutes? This address may already have an account — sign in, or reset your password." +
      planNote,
  };
}

export async function signIn(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = validateCredentials(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  const ip = await callerIp();
  const limited = await consumeAll([
    { name: "signInEmail", subject: parsed.value.email },
    { name: "signInIp", subject: ip },
  ]);
  if (!limited.allowed) return { message: limited.message ?? undefined };

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

  // A correct password proves this caller was not guessing, so the attempts
  // they burned getting here are forgiven rather than left to expire.
  await resetRateLimit("signInEmail", parsed.value.email);

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

  // Refused the same way it succeeds — a generic line that says nothing about
  // whether the address is registered. The limit is what stops this endpoint
  // being used to mail arbitrary strangers on our sending reputation.
  const limited = await consumeAll([
    { name: "passwordResetEmail", subject: email.value },
    { name: "passwordResetIp", subject: await callerIp() },
  ]);
  if (!limited.allowed) {
    return { success: true, message: limited.message ?? undefined };
  }

  const supabase = await createClient();
  const siteUrl = await getSiteUrl();

  // Errors are deliberately swallowed. The response must not differ between a
  // registered and an unregistered address, so the same confirmation shows
  // either way and real failures go to the server log.
  const { error } = await supabase.auth.resetPasswordForEmail(email.value, {
    redirectTo: `${siteUrl}/auth/confirm?flow=recovery&next=/update-password`,
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
