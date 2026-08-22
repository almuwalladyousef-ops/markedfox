import type { Platform } from "@/lib/platforms/types";

// The first-run checklist.
//
// Deliberately derived from real state rather than from a wizard the user
// clicks through: a step is done when the thing is actually true, so somebody
// who connected an account before ever seeing this list arrives with it already
// ticked. A checklist that can disagree with reality is worse than none.

export type StepId = "connect" | "compose" | "automate" | "research" | "billing";

export interface OnboardingStep {
  id: StepId;
  title: string;
  /** What doing it gets them, in their terms — not what it does. */
  detail: string;
  href: string;
  cta: string;
  done: boolean;
  /** Shown but not actionable on this plan. Never hidden. */
  locked?: boolean;
}

export interface OnboardingFacts {
  connectedPlatforms: Platform[];
  postCount: number;
  ruleCount: number;
  researchSourceCount: number;
  planId: string;
  researchAllowed: boolean;
}

export function buildSteps(facts: OnboardingFacts): OnboardingStep[] {
  return [
    {
      id: "connect",
      title: "Connect an account",
      detail:
        "Everything else needs one. Instagram first if you plan to use the DM automations — it is the only platform that has them today.",
      href: "/dashboard/accounts",
      cta: "Connect",
      done: facts.connectedPlatforms.length > 0,
    },
    {
      id: "compose",
      title: "Publish or schedule a post",
      detail:
        "One caption, every account you picked, with each platform's own settings on the same screen.",
      href: "/dashboard/new-post",
      cta: "Compose",
      done: facts.postCount > 0,
    },
    {
      id: "automate",
      title: "Set up a comment-to-DM automation",
      detail:
        "Somebody comments a keyword, they get the link in a DM, and a public reply shows everyone else it works.",
      href: "/dashboard/automations/templates",
      cta: "Pick a template",
      done: facts.ruleCount > 0,
    },
    {
      id: "research",
      title: "Track a channel worth studying",
      detail:
        "MarkedFox watches it and flags the videos that beat that channel's own average — the ones worth learning from.",
      href: "/dashboard/research/channels",
      cta: "Pick channels",
      done: facts.researchSourceCount > 0,
      locked: !facts.researchAllowed,
    },
    {
      id: "billing",
      title: "Choose a plan",
      detail:
        "Free covers two posts a day and one automation. Everything above that is a plan away.",
      href: "/dashboard/settings",
      cta: "See plans",
      done: facts.planId !== "free",
    },
  ];
}

/** How far along, for the progress line. */
export function progress(steps: OnboardingStep[]): {
  done: number;
  total: number;
  next: OnboardingStep | null;
} {
  const actionable = steps.filter((step) => !step.locked);
  const done = actionable.filter((step) => step.done).length;
  return {
    done,
    total: actionable.length,
    // The first unfinished step that is actually available: pointing somebody
    // at a step their plan does not include is a dead end.
    next: actionable.find((step) => !step.done) ?? null,
  };
}

// ── the three questions ────────────────────────────────────────────────────
// Asked once, skippable, and used only to tune what gets recommended. Nothing
// here gates a feature — a wrong answer costs the user nothing.

export const QUESTIONS = [
  {
    key: "tenure",
    question: "How long have you been making content?",
    options: [
      { value: "new", label: "Less than 3 months" },
      { value: "some", label: "3–12 months" },
      { value: "veteran", label: "More than a year" },
    ],
  },
  {
    key: "audience_size",
    question: "How big is your audience?",
    options: [
      { value: "small", label: "Under 1,000" },
      { value: "medium", label: "1,000–25,000" },
      { value: "large", label: "More than 25,000" },
    ],
  },
  {
    key: "cadence",
    question: "How often do you post?",
    options: [
      { value: "low", label: "0–1 a week" },
      { value: "medium", label: "2–3 a week" },
      { value: "high", label: "More than 3 a week" },
    ],
  },
] as const;

export type QuestionKey = (typeof QUESTIONS)[number]["key"];

export function isValidAnswer(key: string, value: string): boolean {
  const question = QUESTIONS.find((q) => q.key === key);
  return Boolean(
    question?.options.some((option) => option.value === value),
  );
}
