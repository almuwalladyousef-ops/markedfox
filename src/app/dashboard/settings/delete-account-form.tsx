"use client";

import { useActionState } from "react";

import {
  deleteOwnAccountAction,
  type DeleteAccountFormState,
} from "@/lib/account/actions";
import { DELETE_CONFIRMATION_WORD } from "@/lib/account/constants";

const INITIAL: DeleteAccountFormState = {};

export function DeleteAccountForm() {
  const [state, formAction, pending] = useActionState(deleteOwnAccountAction, INITIAL);

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-3">
      <label htmlFor="confirm" className="text-sm text-neutral-300">
        Type <span className="font-mono font-semibold">{DELETE_CONFIRMATION_WORD}</span> to
        confirm
      </label>
      <input
        id="confirm"
        name="confirm"
        type="text"
        autoComplete="off"
        required
        className="max-w-xs rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-neutral-50 outline-none transition focus:border-red-800 focus:ring-1 focus:ring-red-800"
      />
      {state.message ? (
        <p aria-live="polite" className="text-sm text-red-300">
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-md bg-red-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Deleting…" : "Delete my account"}
      </button>
    </form>
  );
}
