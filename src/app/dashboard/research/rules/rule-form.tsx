"use client";

import { useActionState, useState } from "react";

import { Icon } from "@/components/icons";
import { Busy, Button, Card, Field, inputClass, Notice, Toggle } from "@/components/ui";
import {
  saveAutomationAction,
  type StudioFormState,
} from "@/lib/research/studio-actions";
import type { AutomationRow } from "@/lib/research/studio-types";

const EMPTY: StudioFormState = {};

export function RuleForm({
  rule,
  sources,
  onDone,
}: {
  rule?: AutomationRow;
  sources: { id: string; label: string }[];
  onDone?: () => void;
}) {
  const [state, action, pending] = useActionState(saveAutomationAction, EMPTY);
  const [active, setActive] = useState(rule?.active ?? true);

  return (
    <Card>
      <form action={action} className="flex flex-col gap-4">
        {rule ? <input type="hidden" name="id" value={rule.id} /> : null}

        {/* auto-fit rather than a fixed two columns: this form is rendered
            both full-width on the page and inside a rule card, and a hard
            `sm:grid-cols-2` overflowed the narrower one. */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-5">
          <Field label="Name">
            <input
              name="name"
              required
              maxLength={80}
              defaultValue={rule?.name ?? ""}
              placeholder="Top daily performers"
              className={inputClass}
            />
          </Field>

          <Field label="Channel">
            <select
              name="source_id"
              defaultValue={rule?.source_id ?? ""}
              className={inputClass}
            >
              <option value="">All channels</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.label}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Min outlier score"
            hint="Multiple of the channel's own median. 2 means it doubled its normal."
          >
            <input
              type="number"
              name="min_outlier_score"
              step={0.1}
              min={0}
              defaultValue={rule?.min_outlier_score ?? 2}
              className={inputClass}
            />
          </Field>

          <Field label="Min views">
            <input
              type="number"
              name="min_views"
              min={0}
              step={1000}
              defaultValue={rule?.min_views ?? 25000}
              className={inputClass}
            />
          </Field>

          <Field label="Min engagement rate (%)">
            <input
              type="number"
              name="min_engagement_rate"
              min={0}
              max={100}
              step={0.5}
              defaultValue={
                rule ? Math.round(rule.min_engagement_rate * 1000) / 10 : 2
              }
              className={inputClass}
            />
          </Field>

          <Field
            label="Daily limit"
            hint="Every analysis spends one credit. This is the ceiling that stops a channel's busy week emptying the month."
          >
            <input
              type="number"
              name="daily_limit"
              min={1}
              max={50}
              defaultValue={rule?.daily_limit ?? 5}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="flex items-center gap-3">
          <input type="hidden" name="active" value={active ? "1" : "0"} />
          <Toggle
            on={active}
            label="Active"
            onClick={() => setActive((v) => !v)}
          />
          <span className="text-[14.5px] font-semibold text-ink">Active</span>
        </div>

        {state.message ? (
          <Notice tone={state.ok ? "ok" : "warn"}>{state.message}</Notice>
        ) : null}

        <div className="flex gap-2">
          <Button type="submit" tone="primary" size="sm" disabled={pending}>
            <Busy busy={pending}>
              {pending ? "Saving…" : rule ? "Save changes" : "Add rule"}
            </Busy>
          </Button>
          {onDone ? (
            <Button type="button" size="sm" onClick={onDone}>
              Cancel
            </Button>
          ) : null}
        </div>
      </form>
    </Card>
  );
}

export function AddRule({ sources }: { sources: { id: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button tone="primary" size="sm" onClick={() => setOpen(true)}>
        <Icon name="plus" className="h-4 w-4" strokeWidth={2.1} />
        Add rule
      </Button>
    );
  }
  return <RuleForm sources={sources} onDone={() => setOpen(false)} />;
}
