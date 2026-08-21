"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Field, FormMessage, SubmitButton } from "../_components/form-parts";
import { signUp, type AuthFormState } from "@/lib/auth/actions";
import { MIN_PASSWORD_LENGTH, type IntendedPlan } from "@/lib/auth/validation";

const INITIAL: AuthFormState = {};

const PLAN_LABELS: Record<IntendedPlan, string> = { pro: "Pro", studio: "Studio" };

export function SignupForm({ plan }: { plan?: IntendedPlan }) {
  const [state, formAction, pending] = useActionState(signUp, INITIAL);

  // On success the form is replaced by the confirmation notice: leaving the
  // fields visible invites a second submit that would only produce a second
  // email.
  if (state.success) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-[19px] font-bold tracking-[-0.02em]">
          Check your email
        </h1>
        <FormMessage state={state} />
        <Link
          href="/login"
          className="text-[13px] text-accent hover:brightness-[1.08]"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-[19px] font-bold tracking-[-0.02em]">
          Create your account
        </h1>
        <p className="text-[13px] text-muted">
          Publish everywhere. Automate every DM. Free to start.
        </p>
      </div>

      {plan ? (
        <p className="rounded-[10px] border border-line bg-chip px-3 py-2 text-[13px] text-ink">
          You picked <span className="font-semibold">{PLAN_LABELS[plan]}</span>.
          Every account starts on Free; you can upgrade from Settings once
          billing opens — we will remember your choice.
        </p>
      ) : null}
      {plan ? <input type="hidden" name="plan" value={plan} /> : null}

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

      <SubmitButton pending={pending}>
        Create account — it&rsquo;s free
      </SubmitButton>

      <p className="pt-1 text-[13px] text-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-accent hover:brightness-[1.08]">
          Sign in
        </Link>
      </p>

      <p className="text-center text-[11.5px] text-faint">
        No card required · 2 posts a day and 1 DM rule on Free
      </p>
    </form>
  );
}
