"use client";

import { useActionState } from "react";

import { Field, FormMessage, SubmitButton } from "../_components/form-parts";
import { updatePassword, type AuthFormState } from "@/lib/auth/actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/validation";

const INITIAL: AuthFormState = {};

export function UpdatePasswordForm() {
  const [state, formAction, pending] = useActionState(updatePassword, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Set a new password</h1>
        <p className="text-sm text-muted">
          You are signed in from your reset link.
        </p>
      </div>

      <FormMessage state={state} />

      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        error={state.errors?.password}
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
      />
      <Field
        label="Confirm new password"
        name="confirm_password"
        type="password"
        autoComplete="new-password"
        error={state.errors?.confirm_password}
      />

      <SubmitButton pending={pending}>Save password</SubmitButton>
    </form>
  );
}
