"use client";

import type { AuthFormState } from "@/lib/auth/actions";

// Shared pieces for the four auth forms. Client components because they render
// useActionState output; the actions themselves stay on the server.

export function Field({
  label,
  name,
  type,
  autoComplete,
  error,
  defaultValue,
  hint,
}: {
  label: string;
  name: string;
  type: "email" | "password";
  autoComplete: string;
  error?: string;
  defaultValue?: string;
  hint?: string;
}) {
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium text-neutral-300">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        required
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-neutral-50 outline-none transition focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 aria-[invalid=true]:border-red-800"
      />
      {error ? (
        <p id={errorId} className="text-sm text-red-400">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-neutral-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function SubmitButton({
  pending,
  children,
}: {
  pending: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1 rounded-md bg-neutral-50 px-3 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Working…" : children}
    </button>
  );
}

// aria-live so screen readers announce the result of a submit that does not
// navigate — the reset and signup forms both stay on the page.
export function FormMessage({ state }: { state: AuthFormState }) {
  if (!state.message) return null;

  return (
    <p
      aria-live="polite"
      className={
        state.success
          ? "rounded-md border border-emerald-900 bg-emerald-950/50 px-3 py-2 text-sm text-emerald-300"
          : "rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300"
      }
    >
      {state.message}
    </p>
  );
}
