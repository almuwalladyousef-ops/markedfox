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
      <label htmlFor={name} className="text-sm font-medium text-ink">
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
        className="rounded-md border border-line bg-chip px-3 py-2 text-ink outline-none transition focus:border-line-strong focus:ring-1 focus:ring-neutral-500 aria-[invalid=true]:border-danger"
      />
      {error ? (
        <p id={errorId} className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-faint">
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
      className="mt-1 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-ink transition hover:brightness-[1.08] disabled:cursor-not-allowed disabled:opacity-60"
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
          ? "rounded-md border border-ok bg-ok-soft px-3 py-2 text-sm text-ok"
          : "rounded-md border border-danger bg-danger-soft px-3 py-2 text-sm text-danger"
      }
    >
      {state.message}
    </p>
  );
}
