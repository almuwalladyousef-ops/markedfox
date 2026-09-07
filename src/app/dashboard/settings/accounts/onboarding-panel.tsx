"use client";

import Link from "next/link";
import { Icon, PlanDiamond } from "@/components/icons";
import { Button, Card } from "@/components/ui";
import {
  dismissOnboardingAction,
  saveOnboardingAnswersAction,
} from "@/lib/onboarding/actions";
import { QUESTIONS, type OnboardingStep } from "@/lib/onboarding/steps";

// The first thing a new account sees.
//
// Not a modal and not a wizard: a card at the top of the dashboard that a
// person can ignore, work down, or dismiss. Every step links to the real page
// rather than to a simulation of it, and every step's done-ness comes from
// actual state — so somebody who did half of this before finding the list
// arrives with half of it ticked.

export function OnboardingPanel({
  steps,
  done,
  total,
  askQuestions,
}: {
  steps: OnboardingStep[];
  done: number;
  total: number;
  askQuestions: boolean;
}) {
  if (askQuestions) {
    return (
      <Card>
        <h2 className="text-sm font-semibold text-ink">
          Three questions, then we get out of the way
        </h2>
        <p className="mt-1 text-[11.5px] text-faint">
          They only tune what gets recommended. Skip them and nothing breaks.
        </p>

        {/* Both buttons submit. Skipping has to WRITE the row — it is the row
            that records the questions were asked, and a local piece of state
            saying "hidden" is forgotten by the next revalidation, so the
            questions came back forever and the checklist's own dismiss button
            (on the other branch of this component) was unreachable. */}
        <form action={saveOnboardingAnswersAction} className="mt-4 flex flex-col gap-5">
          {QUESTIONS.map((question) => (
            <fieldset key={question.key}>
              <legend className="text-[13px] text-ink">
                {question.question}
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {question.options.map((option) => (
                  <label
                    key={option.value}
                    className="cursor-pointer rounded-full border border-line px-3.5 py-2 text-[13px] text-muted transition-colors hover:border-line-strong has-checked:border-accent has-checked:bg-accent-soft has-checked:text-accent"
                  >
                    <input
                      type="radio"
                      name={question.key}
                      value={option.value}
                      className="sr-only"
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}

          <div className="flex items-center gap-3">
            <Button type="submit" tone="primary">
              Continue
            </Button>
            <button
              type="submit"
              name="skipped"
              value="1"
              className="text-[13px] text-faint transition-colors hover:text-ink"
            >
              Skip
            </button>
          </div>
        </form>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">
          Getting started
          <span className="ml-2 text-[11.5px] font-normal text-faint">
            {done} of {total} done
          </span>
        </h2>
        <form action={dismissOnboardingAction}>
          <button
            type="submit"
            className="text-[11.5px] text-faint transition-colors hover:text-ink"
          >
            Hide this
          </button>
        </form>
      </div>

      <div className="mt-3 h-1 overflow-hidden rounded-full bg-chip">
        <div
          className="h-full rounded-sm bg-accent transition-[width] duration-110"
          style={{ width: `${total === 0 ? 0 : (done / total) * 100}%` }}
        />
      </div>

      <ol className="mt-3 flex flex-col">
        {steps.map((step) => (
          <li key={step.id}>
            <Link
              href={step.href}
              className={`flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition-[background-color,color] duration-110 hover:bg-chip ${
                step.done ? "opacity-55" : ""
              }`}
            >
              <span
                aria-hidden
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${
                  step.done
                    ? "bg-ok-soft text-ok"
                    : "border border-line-strong text-transparent"
                }`}
              >
                <Icon name="check" className="h-2.5 w-2.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span
                    className={`text-[13px] ${step.done ? "text-muted line-through" : "text-ink"}`}
                  >
                    {step.title}
                  </span>
                  {step.locked ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-warn-soft px-2 py-px text-[10px] font-semibold text-warn">
                      <PlanDiamond className="h-2.5 w-2.5" />
                      Studio
                    </span>
                  ) : null}
                </span>
                {!step.done ? (
                  <span className="mt-0.5 block text-[11.5px]/[17px] text-faint">
                    {step.detail}
                  </span>
                ) : null}
              </span>
              {!step.done ? (
                <span className="shrink-0 text-[11.5px] text-muted">
                  {step.cta} →
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}
