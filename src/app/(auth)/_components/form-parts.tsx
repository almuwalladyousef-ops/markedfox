"use client";

import { Busy, buttonClass } from "@/components/ui";
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
      <label htmlFor={name} className="text-xs font-semibold text-muted">
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
        /* 15px rather than 14: anything smaller makes iOS Safari zoom the
           whole page on focus, which reads as the form jumping away. */
        className="rounded-md border border-line bg-chip px-3 py-2.5 text-[15px] text-ink outline-none transition-colors focus:border-accent aria-[invalid=true]:border-danger"
      />
      {error ? (
        <p id={errorId} className="text-[12.5px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-[11.5px] text-faint">
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
      className={buttonClass("primary", "md", "mt-1 w-full")}
    >
      <Busy busy={pending}>
        {pending ? "Working…" : children}
      </Busy>
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
          ? "rounded-md border border-ok bg-ok-soft px-3 py-2 text-[13px] text-ok"
          : "rounded-md border border-danger bg-danger-soft px-3 py-2 text-[13px] text-danger"
      }
    >
      {state.message}
    </p>
  );
}
