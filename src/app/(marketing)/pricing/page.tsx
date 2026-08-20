import type { Metadata } from "next";

import Link from "next/link";

export const metadata: Metadata = {
  title: "Pricing · MarkedFox",
  description:
    "Free to start. Pro $20/month, Studio $49/month, two months free on annual billing.",
};

// The pricing table as marketing. The numbers mirror the `plans` table, which
// is what actually enforces them — if the two ever disagree, the database
// wins and this page is the bug.
//
// Pricing rule 1 (CLAUDE.md): the X cap is stated WHEREVER the word
// "unlimited" appears, in the comparison itself — X bills per post and is
// never unlimited on any plan.

type Plan = {
  id: string;
  name: string;
  monthly: string;
  annual?: string;
  blurb: string;
  cta: { label: string; href: string };
  highlight?: boolean;
  features: string[];
};

const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    monthly: "$0",
    blurb: "Everything you need to see it work.",
    cta: { label: "Start free", href: "/signup" },
    features: [
      "2 workspaces",
      "3 connected accounts per workspace",
      "2 posts per day (pooled)",
      "Instagram, Facebook, Threads, TikTok, YouTube, Snapchat",
      "1 DM rule · 200 DM sends per month",
      "X not included — X charges per post",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    monthly: "$20",
    annual: "$200/yr — two months free",
    blurb: "For creators posting every day.",
    cta: { label: "Get Pro", href: "/signup?plan=pro" },
    highlight: true,
    features: [
      "5 workspaces",
      "Unlimited connected accounts",
      "Unlimited posts",
      "All platforms",
      "X: 300 posts per month, no external links — X charges per post, so it is never unlimited",
      "Unlimited DM rules · 10,000 DM sends per month",
    ],
  },
  {
    id: "studio",
    name: "Studio",
    monthly: "$49",
    annual: "$490/yr — two months free",
    blurb: "Everything in Pro, plus research.",
    cta: { label: "Get Studio", href: "/signup?plan=studio" },
    features: [
      "10 workspaces",
      "Unlimited connected accounts",
      "Unlimited posts",
      "All platforms",
      "X: 300 posts per month, no external links — X charges per post, so it is never unlimited",
      "Unlimited DM rules · 10,000 DM sends per month",
      "Research: watch any creator's channel and see which videos beat that channel's own average",
      "100 AI generations per month — hooks, outlines, and scripts written from a winning video",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    monthly: "Custom",
    blurb: "Raised limits for teams and agencies.",
    cta: {
      label: "Contact us",
      href: "mailto:hello@markedfox.com?subject=MarkedFox%20Enterprise",
    },
    features: [
      "Unlimited workspaces",
      "Raised caps on X posts, DM sends, and research credits",
      "Priority support",
    ],
  },
];

export default function PricingPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-20">
      <h1 className="text-center text-4xl font-bold tracking-tight">Pricing</h1>
      <p className="mx-auto mt-4 max-w-xl text-center text-neutral-400">
        Start free, upgrade when you outgrow it. Annual billing gets roughly
        two months free.
      </p>

      <div className="mt-14 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className={`flex flex-col rounded-xl border p-6 ${
              plan.highlight
                ? "border-orange-500/60 bg-orange-950/10"
                : "border-neutral-900"
            }`}
          >
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">{plan.name}</h2>
              {plan.highlight ? (
                <span className="rounded-full border border-orange-800/60 bg-orange-950/40 px-2 py-0.5 text-[10px] font-medium text-orange-300">
                  Most popular
                </span>
              ) : null}
            </div>
            <p className="mt-3 text-3xl font-bold">
              {plan.monthly}
              {plan.monthly.startsWith("$") && plan.monthly !== "$0" ? (
                <span className="text-sm font-normal text-neutral-500">/mo</span>
              ) : null}
            </p>
            {plan.annual ? (
              <p className="mt-1 text-xs text-neutral-500">{plan.annual}</p>
            ) : null}
            <p className="mt-3 text-sm text-neutral-400">{plan.blurb}</p>

            <ul className="mt-6 flex flex-1 flex-col gap-2.5 text-sm text-neutral-300">
              {plan.features.map((feature) => (
                <li key={feature} className="flex gap-2">
                  <span aria-hidden="true" className="text-orange-400">
                    ✓
                  </span>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <a
              href={plan.cta.href}
              className={`mt-8 rounded-md px-4 py-2.5 text-center text-sm font-semibold transition ${
                plan.highlight
                  ? "bg-neutral-50 text-neutral-950 hover:bg-white"
                  : "border border-neutral-800 text-neutral-200 hover:border-neutral-600"
              }`}
            >
              {plan.cta.label}
            </a>
          </div>
        ))}
      </div>

      <div className="mx-auto mt-14 max-w-2xl rounded-lg border border-neutral-900 p-5 text-sm text-neutral-400">
        <h2 className="font-semibold text-neutral-200">Why is X different?</h2>
        <p className="mt-2">
          Every other platform costs nothing per post, so those are genuinely
          unlimited. X charges for every post made through its API — and 13x
          more when the post contains an external link — so X carries a hard
          monthly number on every plan and links in X posts are blocked. This
          is stated here rather than in fine print because it will never
          change.
        </p>
      </div>

      <p className="mt-10 text-center text-sm text-neutral-500">
        Questions?{" "}
        <Link href="mailto:support@markedfox.com" className="text-neutral-300 underline hover:text-white">
          support@markedfox.com
        </Link>
      </p>
    </main>
  );
}
