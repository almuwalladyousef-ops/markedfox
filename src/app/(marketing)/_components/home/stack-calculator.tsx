"use client";

import Link from "next/link";
import { useState } from "react";

import { Icon } from "@/components/icons";
import { buttonClass, cx, segmentedItem, segmentedTrack } from "@/components/ui";

import { PRICE, type PaidPlanId } from "../plans-data";

// The stack calculator.
//
// Borrowed in shape from the reference product's earnings slider, and
// deliberately inverted: it does not invent revenue somebody might make, it
// adds up money they are already spending. Every number in it is one the
// visitor typed. The only figures the page supplies are MarkedFox's own,
// which come from PRICE beside the plan rows so the two cannot drift.

type Line = { id: string; label: string; note: string; start: number };

const LINES: Line[] = [
  {
    id: "publish",
    label: "Posting and scheduling",
    note: "The tool that puts one video on every platform",
    start: 12,
  },
  {
    id: "dm",
    label: "Comment and DM automation",
    note: "The tool that answers a keyword with a DM",
    start: 15,
  },
  {
    id: "research",
    label: "Research and scripting",
    note: "The tool that shows what to make next",
    start: 29,
  },
];

const MAX = 120;

function money(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

export function StackCalculator() {
  const [spend, setSpend] = useState<Record<string, number>>(() =>
    Object.fromEntries(LINES.map((line) => [line.id, line.start])),
  );
  const [yearly, setYearly] = useState(true);
  const [plan, setPlan] = useState<PaidPlanId>("pro");

  const today = LINES.reduce((sum, line) => sum + (spend[line.id] ?? 0), 0);
  const todayYear = today * 12;

  const chosen = PRICE[plan];
  const foxYear = yearly ? chosen.annual : chosen.monthly * 12;
  const difference = todayYear - foxYear;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 wide:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
      {/* What they pay now. Everything here is the visitor's own number. */}
      <div className="rounded-2xl border border-line bg-panel p-6 shell:p-8">
        <p className="text-[13px] font-semibold text-faint">
          What you pay today
        </p>
        <h3 className="font-display mt-1 text-[24px]/[30px] font-bold tracking-[-0.025em] text-ink">
          Drag these to your own numbers
        </h3>

        <div className="mt-7 flex flex-col gap-7">
          {LINES.map((line) => (
            <div key={line.id}>
              <div className="flex items-baseline justify-between gap-4">
                <label
                  htmlFor={`stack-${line.id}`}
                  className="text-[15px] font-semibold text-ink"
                >
                  {line.label}
                </label>
                <span className="font-display text-[17px] font-bold text-ink tabular-nums">
                  {money(spend[line.id] ?? 0)}
                  <span className="text-[13px] font-semibold text-faint">
                    /mo
                  </span>
                </span>
              </div>
              <p className="mt-0.5 text-[13px]/[19px] text-faint">{line.note}</p>
              <input
                id={`stack-${line.id}`}
                type="range"
                min={0}
                max={MAX}
                step={1}
                value={spend[line.id] ?? 0}
                onChange={(event) =>
                  setSpend((current) => ({
                    ...current,
                    [line.id]: Number(event.target.value),
                  }))
                }
                className="mt-3 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-chip accent-accent"
              />
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-line pt-6">
          <div className={segmentedTrack} role="tablist" aria-label="Billing">
            {(
              [
                ["Monthly", false],
                ["Yearly", true],
              ] as const
            ).map(([label, value]) => (
              <button
                key={label}
                type="button"
                role="tab"
                aria-selected={yearly === value}
                onClick={() => setYearly(value)}
                className={segmentedItem(yearly === value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className={segmentedTrack} role="tablist" aria-label="Plan">
            {(Object.keys(PRICE) as PaidPlanId[]).map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={plan === id}
                onClick={() => setPlan(id)}
                className={segmentedItem(plan === id)}
              >
                {PRICE[id].name} {money(PRICE[id].monthly)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* The answer. */}
      <div className="flex flex-col rounded-2xl bg-dock p-6 text-dock-hover shell:p-8">
        <p className="text-[13px] font-semibold text-accent">Side by side</p>

        <dl className="mt-6 divide-y divide-[rgba(255,255,255,0.12)]">
          <div className="flex items-baseline justify-between gap-4 pb-4">
            <dt className="text-[15px] text-[rgba(255,255,255,0.78)]">
              Three tools, today
            </dt>
            <dd className="font-display text-[22px] font-bold tabular-nums">
              {money(todayYear)}
              <span className="text-[13px] font-semibold text-[rgba(255,255,255,0.6)]">
                /yr
              </span>
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 py-4">
            <dt className="text-[15px] text-[rgba(255,255,255,0.78)]">
              MarkedFox {chosen.name}, {yearly ? "billed yearly" : "billed monthly"}
            </dt>
            <dd className="font-display text-[22px] font-bold tabular-nums">
              {money(foxYear)}
              <span className="text-[13px] font-semibold text-[rgba(255,255,255,0.6)]">
                /yr
              </span>
            </dd>
          </div>
        </dl>

        <div className="mt-6">
          <p className="text-[13px] font-semibold text-accent">
            {difference >= 0 ? "You keep" : "MarkedFox costs more by"}
          </p>
          <p className="font-display mt-1 text-[48px]/[52px] font-bold tracking-[-0.035em] tabular-nums shell:text-[60px]/[64px]">
            {money(Math.abs(difference))}
          </p>
          <p className="mt-1 text-[15px] text-[rgba(255,255,255,0.72)]">
            a year, on one bill and one login.
          </p>
        </div>

        <ul className="mt-7 flex flex-col gap-2.5 border-t border-[rgba(255,255,255,0.12)] pt-6">
          {[
            "One subscription covers publishing, DM automation and research",
            "Yearly billing is two months free on every paid plan",
            "X is capped at 300 posts a month on every paid plan",
          ].map((line) => (
            <li
              key={line}
              className="flex gap-3 text-[14px]/[21px] text-[rgba(255,255,255,0.78)]"
            >
              <span className="mt-[4px] inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center text-accent">
                <Icon name="check" className="h-3.5 w-3.5" strokeWidth={2.4} />
              </span>
              <span className="text-pretty">{line}</span>
            </li>
          ))}
        </ul>

        <Link
          href="/signup"
          className={cx(buttonClass("primary", "md"), "mt-8 self-start")}
        >
          Start free — no card
        </Link>
      </div>
    </div>
  );
}
