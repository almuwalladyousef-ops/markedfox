import type { Metadata } from "next";

import Link from "next/link";

import { PlanGrid, type MarketingPlan } from "./plan-grid";

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

const X_LINE =
  "X: 300 posts per month, no external links — X charges per post, so it is never unlimited";

const PLANS: MarketingPlan[] = [
  {
    id: "free",
    name: "Free",
    monthly: "$0",
    annual: "$0",
    blurb: "Everything you need to see it work.",
    cta: { label: "Start free", href: "/signup" },
    features: [
      { text: "2 workspaces" },
      { text: "3 connected accounts per workspace" },
      { text: "2 posts per day (pooled)" },
      { text: "Instagram, Facebook, Threads, TikTok, YouTube, Snapchat" },
      { text: "1 DM rule · 200 DM sends per month" },
      { text: "X not included — X charges per post", included: false },
      { text: "No research credits", included: false },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    monthly: "$20",
    annual: "$200",
    blurb: "For creators posting every day.",
    cta: { label: "Get Pro", href: "/signup?plan=pro" },
    highlight: true,
    features: [
      { text: "5 workspaces" },
      { text: "Unlimited connected accounts" },
      { text: "Unlimited posts" },
      { text: "All platforms" },
      { text: X_LINE },
      { text: "Unlimited DM rules · 10,000 DM sends per month" },
      { text: "No research credits", included: false },
    ],
  },
  {
    id: "studio",
    name: "Studio",
    monthly: "$49",
    annual: "$490",
    blurb: "Everything in Pro, plus research.",
    cta: { label: "Get Studio", href: "/signup?plan=studio" },
    features: [
      { text: "10 workspaces" },
      { text: "Unlimited connected accounts" },
      { text: "Unlimited posts" },
      { text: "All platforms" },
      { text: X_LINE },
      { text: "Unlimited DM rules · 10,000 DM sends per month" },
      {
        text: "Research: watch any creator's channel and see which videos beat that channel's own average",
      },
      {
        text: "100 AI generations per month — hooks, outlines, and scripts written from a winning video",
      },
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    monthly: "Custom",
    annual: null,
    blurb: "Raised limits for teams and agencies.",
    cta: {
      label: "Contact us",
      href: "mailto:hello@markedfox.com?subject=MarkedFox%20Enterprise",
    },
    features: [
      { text: "Unlimited workspaces" },
      { text: "Raised caps on X posts, DM sends, and research credits" },
      { text: "Priority support" },
    ],
  },
];

export default function PricingPage() {
  return (
    <main className="mx-auto max-w-[1120px] px-6 py-16">
      <h1 className="font-display text-center text-[38px] font-bold tracking-[-0.02em]">
        Pricing
      </h1>
      <p className="mx-auto mt-3 max-w-xl text-center text-[13.5px]/[20px] text-muted">
        Start free, upgrade when you outgrow it.
      </p>

      <PlanGrid plans={PLANS} />

      <div className="mx-auto mt-12 max-w-2xl rounded-[14px] border border-line bg-panel p-5 text-[13px]/[20px] text-muted">
        <h2 className="font-semibold text-ink">Why is X different?</h2>
        <p className="mt-2">
          Every other platform costs nothing per post, so those are genuinely
          unlimited. X charges for every post made through its API — and 13x
          more when the post contains an external link — so X carries a hard
          monthly number on every plan and links in X posts are blocked. This
          is stated here rather than in fine print because it will never
          change.
        </p>
      </div>

      <p className="mt-8 text-center text-[13px] text-faint">
        Questions?{" "}
        <Link
          href="mailto:support@markedfox.com"
          className="text-accent transition-[filter,scale] duration-150 hover:brightness-[1.08] active:scale-[0.97]"
        >
          support@markedfox.com
        </Link>
      </p>
    </main>
  );
}
