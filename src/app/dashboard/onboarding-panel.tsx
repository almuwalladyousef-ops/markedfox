"use client";

import Link from "next/link";
import { useState } from "react";

import { Card, Pill } from "@/components/ui";
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
  const [showQuestions, setShowQuestions] = useState(askQuestions);

  if (showQuestions) {
    return (
      <Card>
        <h2 className="text-sm font-semibold">
          Three questions, then we get out of the way
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          They only tune what gets recommended. Skip them and nothing breaks.
        </p>

        <form
          action={saveOnboardingAnswersAction}
          onSubmit={() => setShowQuestions(false)}
          className="mt-4 flex flex-col gap-5"
        >
          {QUESTIONS.map((question) => (
            <fieldset key={question.key}>
              <legend className="text-sm text-neutral-300">
                {question.question}
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {question.options.map((option) => (
                  <label
                    key={option.value}
                    className="cursor-pointer rounded-full border border-neutral-800 px-3 py-1.5 text-sm text-neutral-300 transition hover:border-neutral-600 has-checked:border-neutral-400 has-checked:bg-neutral-900 has-checked:text-neutral-50"
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
            <button
              type="submit"
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-neutral-200"
            >
              Continue
            </button>
            <button
              type="button"
              onClick={() => setShowQuestions(false)}
              className="text-sm text-neutral-500 transition hover:text-neutral-300"
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
        <div>
          <h2 className="text-sm font-semibold">Getting started</h2>
          <p className="mt-1 text-xs text-neutral-500">
            {done} of {total} done
          </p>
        </div>
        <form action={dismissOnboardingAction}>
          <button
            type="submit"
            className="text-xs text-neutral-600 transition hover:text-neutral-400"
          >
            Hide this
          </button>
        </form>
      </div>

      <div className="mt-3 h-1 overflow-hidden rounded-full bg-neutral-900">
        <div
          className="h-full rounded-full bg-emerald-600 transition-all"
          style={{ width: `${total === 0 ? 0 : (done / total) * 100}%` }}
        />
      </div>

      <ol className="mt-4 flex flex-col gap-1">
        {steps.map((step) => (
          <li key={step.id}>
            <Link
              href={step.href}
              className={`flex items-start gap-3 rounded-lg px-2 py-2 transition hover:bg-neutral-900/60 ${
                step.done ? "opacity-60" : ""
              }`}
            >
              <span
                aria-hidden
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                  step.done
                    ? "border-emerald-700 bg-emerald-950 text-emerald-300"
                    : "border-neutral-700 text-transparent"
                }`}
              >
                ✓
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span
                    className={`text-sm ${step.done ? "text-neutral-400 line-through" : "text-neutral-100"}`}
                  >
                    {step.title}
                  </span>
                  {step.locked ? <Pill tone="warn">💎 Studio</Pill> : null}
                </span>
                {!step.done ? (
                  <span className="mt-0.5 block text-xs leading-relaxed text-neutral-500">
                    {step.detail}
                  </span>
                ) : null}
              </span>
              {!step.done ? (
                <span className="shrink-0 text-xs text-neutral-400">
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
