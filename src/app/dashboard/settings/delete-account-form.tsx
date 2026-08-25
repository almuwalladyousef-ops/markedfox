"use client";

import { Busy } from "@/components/ui";
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
      <label htmlFor="confirm" className="text-[14.5px] text-ink">
        Type <span className="font-mono font-semibold">{DELETE_CONFIRMATION_WORD}</span> to
        confirm
      </label>
      <input
        id="confirm"
        name="confirm"
        type="text"
        autoComplete="off"
        required
        className="max-w-xs rounded-md border border-line bg-panel px-3.5 py-2.5 text-[14.5px] text-ink outline-none transition-[border-color] duration-110 focus:border-danger"
      />
      {state.message ? (
        <p aria-live="polite" className="text-[14px] text-danger">
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 w-fit rounded-md border border-danger px-4 py-2.5 text-[14px] font-semibold text-danger transition-[background-color,color] duration-110 hover:bg-danger hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
      >
        <Busy busy={pending}>
          {pending ? "Deleting…" : "Delete my account…"}
        </Busy>
      </button>
    </form>
  );
}
