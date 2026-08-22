import Link from "next/link";

import { Card, Pill, cx } from "@/components/ui";
import {
  GOAL_LABELS,
  RULE_TEMPLATES,
  TRIGGER_LABELS,
  type TemplateGoal,
} from "@/lib/dm/templates";

// The grid of starting points, shared by the Templates page and the first
// stage of "+ New automation" so the two cannot drift into describing the same
// eight templates differently.
//
// Every card carries its trigger, because "what has to happen for this to run"
// is the question people are actually choosing between — the goal heading
// above it is how they narrow down, and the trigger is how they decide.

const GOAL_ORDER: TemplateGoal[] = [
  "traffic",
  "followers",
  "engagement",
  "leads",
];

export function TemplatePicker({
  /** The Templates page already has "Start from scratch" in its header. */
  showScratch = true,
}: {
  showScratch?: boolean;
}) {
  return (
    <div className="flex flex-col gap-7">
      {GOAL_ORDER.map((goal) => {
        const templates = RULE_TEMPLATES.filter(
          (template) => template.goal === goal,
        );
        if (templates.length === 0) return null;
        return (
          <section key={goal}>
            <h2 className="font-display text-[18px] font-bold tracking-[-0.01em] text-ink">
              {GOAL_LABELS[goal]}
            </h2>
            <ul className="mt-3.5 grid gap-3.5 shell:grid-cols-2 wide:grid-cols-3">
              {templates.map((template) => (
                <li key={template.id}>
                  <Link
                    href={`/dashboard/automations/new?template=${template.id}`}
                    className="block h-full"
                  >
                    <Card
                      className={cx(
                        "flex h-full flex-col gap-2.5 px-5 py-5",
                        "transition-[border-color] duration-150 hover:border-accent",
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Trigger only. The goal is the heading two lines
                            above the card; repeating it on every card is a
                            pill that never varies within its own group. */}
                        <Pill tone="info">{TRIGGER_LABELS[template.trigger]}</Pill>
                        {template.popular ? (
                          <Pill tone="warn" className="tracking-[0.06em]">
                            POPULAR
                          </Pill>
                        ) : null}
                      </div>
                      <p className="font-display text-[16px]/[22px] font-bold tracking-[-0.01em] text-ink">
                        {template.name}
                      </p>
                      <p className="text-[13.5px]/[20px] text-pretty text-muted">
                        {template.description}
                      </p>
                      {template.needsPaidStep ? (
                        <p className="mt-auto pt-2">
                          <Pill tone="accent">Collects data</Pill>
                        </p>
                      ) : null}
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {showScratch ? (
        <Link
          href="/dashboard/automations/new?scratch=1"
          className="rounded-2xl border border-dashed border-line-strong px-6 py-5 text-center text-[14.5px] font-semibold text-muted transition-[border-color,color] duration-150 hover:border-accent hover:text-ink"
        >
          Start from scratch instead
        </Link>
      ) : null}
    </div>
  );
}
