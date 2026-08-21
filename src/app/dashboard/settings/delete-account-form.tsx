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
      <label htmlFor="confirm" className="text-sm text-ink">
        Type <span className="font-mono font-semibold">{DELETE_CONFIRMATION_WORD}</span> to
        confirm
      </label>
      <input
        id="confirm"
        name="confirm"
        type="text"
        autoComplete="off"
        required
        className="max-w-xs rounded-[10px] border border-line bg-chip px-3 py-2 text-[13.5px] text-ink outline-none transition focus:border-danger"
      />
      {state.message ? (
        <p aria-live="polite" className="text-sm text-danger">
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-[10px] border border-danger px-4 py-2 text-[13px] font-semibold text-danger transition hover:bg-danger hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
      >
        {pending ? "Deleting…" : "Delete my account…"}
      </button>
    </form>
  );
}
