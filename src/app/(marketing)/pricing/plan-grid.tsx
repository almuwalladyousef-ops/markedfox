"use client";

import { useState } from "react";

import { Icon } from "@/components/icons";
import { cx, segmentedItem, segmentedTrack } from "@/components/ui";

// The plan cards, with the one piece of interactivity on the page: monthly or
// yearly. Both prices come from the same rows the checkout uses, so switching
// the toggle can only ever show a price the product can actually charge.

export type MarketingPlan = {
  id: string;
  name: string;
  monthly: string;
  annual: string | null;
  blurb: string;
  cta: { label: string; href: string };
  highlight?: boolean;
  features: { text: string; included?: boolean }[];
};

export function PlanGrid({ plans }: { plans: MarketingPlan[] }) {
  const [interval, setInterval] = useState<"monthly" | "yearly">("monthly");

  return (
    <>
      <div className="mt-8 flex justify-center">
        <div className={segmentedTrack}>
          <button
            type="button"
            onClick={() => setInterval("monthly")}
            aria-pressed={interval === "monthly"}
            className={segmentedItem(interval === "monthly")}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setInterval("yearly")}
            aria-pressed={interval === "yearly"}
            className={segmentedItem(interval === "yearly")}
          >
            Yearly <span className="text-accent">−2 months</span>
          </button>
        </div>
      </div>

      <div className="mt-10 grid items-stretch gap-4 shell:grid-cols-2 wide:grid-cols-4">
        {plans.map((plan) => {
          const yearly = interval === "yearly" && plan.annual !== null;
          const price = yearly ? (plan.annual as string) : plan.monthly;
          const suffix = price.startsWith("$") && price !== "$0"
            ? yearly
              ? "/yr"
              : "/mo"
            : "";

          return (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-2xl bg-panel p-5 ${
                plan.highlight
                  ? "border-2 border-accent shadow-e2"
                  : "border border-line"
              }`}
            >
              {plan.highlight ? (
                <span className="absolute -top-[11px] left-5 rounded-full bg-accent px-2.5 py-1 text-[10.5px] font-bold text-accent-ink">
                  MOST POPULAR
                </span>
              ) : null}

              <h2 className="font-display text-base font-bold">{plan.name}</h2>
              <p className="font-display mt-2 text-[30px] font-bold">
                {price}
                {suffix ? (
                  <span className="text-sm font-normal text-faint">
                    {suffix}
                  </span>
                ) : null}
              </p>
              <p className="mt-2 text-[12.5px] text-muted">{plan.blurb}</p>

              <ul className="mt-5 flex flex-1 flex-col gap-[9px] text-[12.5px]/[18px] text-muted">
                {plan.features.map((feature) => (
                  <li key={feature.text} className="flex gap-2">
                    <span
                      aria-hidden
                      className={cx(
                        "mt-[3px] shrink-0",
                        feature.included === false ? "text-faint" : "text-accent",
                      )}
                    >
                      <Icon
                        name={feature.included === false ? "minus" : "check"}
                        className="h-3 w-3"
                      />
                    </span>
                    <span>{feature.text}</span>
                  </li>
                ))}
              </ul>

              <a
                href={plan.cta.href}
                className={`mt-6 rounded-md px-4 py-2.5 text-center text-[13px] font-semibold transition-[background-color,color,border-color] duration-110 ${
                  plan.highlight
                    ? "bg-accent text-accent-ink transition-[background-color,scale] duration-110 hover:opacity-90 active:scale-[0.97]"
                    : "border border-line-strong text-ink hover:border-accent hover:text-accent"
                }`}
              >
                {plan.cta.label}
              </a>
            </div>
          );
        })}
      </div>
    </>
  );
}
