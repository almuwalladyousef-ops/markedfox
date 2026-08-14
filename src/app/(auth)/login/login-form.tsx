"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Field, FormMessage, SubmitButton } from "../_components/form-parts";
import { signIn, type AuthFormState } from "@/lib/auth/actions";

const INITIAL: AuthFormState = {};

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(signIn, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="text-sm text-neutral-400">Welcome back.</p>
      </div>

      <FormMessage state={state} />

      {/* Carried through the POST so a user bounced off a protected page lands
          back on it. The value is re-validated server-side. */}
      <input type="hidden" name="next" value={next} />

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
        autoComplete="current-password"
        error={state.errors?.password}
      />

      <SubmitButton pending={pending}>Sign in</SubmitButton>

      <div className="flex flex-col gap-2 pt-2 text-sm text-neutral-400">
        <Link href="/reset-password" className="hover:text-neutral-200">
          Forgot your password?
        </Link>
        <p>
          No account?{" "}
          <Link href="/signup" className="text-neutral-200 hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </form>
  );
}
