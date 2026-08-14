"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Field, FormMessage, SubmitButton } from "../_components/form-parts";
import { requestPasswordReset, type AuthFormState } from "@/lib/auth/actions";

const INITIAL: AuthFormState = {};

export function ResetForm() {
  const [state, formAction, pending] = useActionState(
    requestPasswordReset,
    INITIAL,
  );

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
        <h1 className="text-xl font-semibold">Reset your password</h1>
        <p className="text-sm text-neutral-400">
          We will email you a link to set a new one.
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

      <SubmitButton pending={pending}>Send reset link</SubmitButton>

      <Link
        href="/login"
        className="pt-2 text-sm text-neutral-400 hover:text-neutral-200"
      >
        Back to sign in
      </Link>
    </form>
  );
}
