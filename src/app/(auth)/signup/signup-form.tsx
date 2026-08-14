"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Field, FormMessage, SubmitButton } from "../_components/form-parts";
import { signUp, type AuthFormState } from "@/lib/auth/actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/validation";

const INITIAL: AuthFormState = {};

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signUp, INITIAL);

  // On success the form is replaced by the confirmation notice: leaving the
  // fields visible invites a second submit that would only produce a second
  // email.
  if (state.success) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Check your email</h1>
        <FormMessage state={state} />
        <Link
          href="/login"
          className="text-sm text-neutral-400 hover:text-neutral-200"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Create your account</h1>
        <p className="text-sm text-neutral-400">
          Publish everywhere. Automate every DM.
        </p>
      </div>

      <FormMessage state={state} />

      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        error={state.errors?.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        error={state.errors?.password}
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
      />

      <SubmitButton pending={pending}>Create account</SubmitButton>

      <p className="pt-2 text-sm text-neutral-400">
        Already have an account?{" "}
        <Link href="/login" className="text-neutral-200 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
