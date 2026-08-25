"use client";

import { useActionState } from "react";

import { Busy, Button, Card, Field, inputClass, Notice } from "@/components/ui";
import {
  savePersonaAction,
  type StudioFormState,
} from "@/lib/research/studio-actions";
import type { PersonaRow } from "@/lib/research/studio-types";

const EMPTY: StudioFormState = {};

export function PersonaForm({ persona }: { persona: PersonaRow | null }) {
  const [state, action, pending] = useActionState(savePersonaAction, EMPTY);

  return (
    <Card>
      <form action={action} className="flex flex-col gap-4">
        <Field
          label="Niche"
          hint="What this channel is about. Used to keep generated ideas inside your lane."
        >
          <textarea
            name="niche"
            rows={2}
            maxLength={300}
            defaultValue={persona?.niche ?? ""}
            placeholder="Marketing and content strategy for solo founders"
            className={`${inputClass} resize-y`}
          />
        </Field>

        <Field label="Audience" hint="Who is watching, and what they already know.">
          <textarea
            name="audience"
            rows={2}
            maxLength={300}
            defaultValue={persona?.audience ?? ""}
            placeholder="People who run a business alone and have tried the obvious advice already"
            className={`${inputClass} resize-y`}
          />
        </Field>

        <Field label="Voice" hint="How you sound. Be specific — 'casual' produces nothing.">
          <textarea
            name="tone"
            rows={2}
            maxLength={300}
            defaultValue={persona?.tone ?? ""}
            placeholder="Blunt, short sentences, one idea per line, no throat-clearing"
            className={`${inputClass} resize-y`}
          />
        </Field>

        <Field
          label="Never do this"
          hint="Often more useful than the voice: it is what a generic model does that you do not."
        >
          <textarea
            name="avoid"
            rows={2}
            maxLength={300}
            defaultValue={persona?.avoid ?? ""}
            placeholder="No 'in today's fast-paced world', no fake urgency, never end on 'follow for more'"
            className={`${inputClass} resize-y`}
          />
        </Field>

        {state.message ? (
          <Notice tone={state.ok ? "ok" : "warn"}>{state.message}</Notice>
        ) : null}

        <Button type="submit" tone="primary" size="sm" className="w-fit" disabled={pending}>
          <Busy busy={pending}>
            {pending ? "Saving…" : "Save persona"}
          </Busy>
        </Button>
      </form>
    </Card>
  );
}
