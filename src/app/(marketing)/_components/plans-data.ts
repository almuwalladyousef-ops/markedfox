import type { MarketingPlan } from "../pricing/plan-grid";

// The pricing table as marketing, shared by the landing page and /pricing so
// the two can never drift apart. The numbers mirror the `plans` table, which
// is what actually enforces them — if the two ever disagree, the database
// wins and this file is the bug.
//
// Pricing rule 1 (CLAUDE.md): the X cap is stated WHEREVER the word
// "unlimited" appears, in the comparison itself — X bills per post and is
// never unlimited on any plan.

export const X_LINE =
  "X: 300 posts per month, no external links — X charges per post, so it is never unlimited";

export const PLANS: MarketingPlan[] = [
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
      { text: "Post now and save drafts" },
      {
        text: "Scheduling not included — a scheduled post's video waits in storage until it goes out",
        included: false,
      },
      { text: "X not included — X charges per post", included: false },
      { text: "No research credits", included: false },
    ],
  },
  {
    id: "starter",
    name: "Starter",
    monthly: "$8",
    annual: "$80",
    blurb: "Post as much as you like, whenever you like.",
    cta: { label: "Get Starter", href: "/signup?plan=starter" },
    features: [
      { text: "2 workspaces" },
      { text: "Unlimited connected accounts" },
      { text: "Unlimited posts" },
      { text: "Instagram, Facebook, Threads, TikTok, YouTube, Snapchat" },
      { text: "Unlimited DM rules \u00b7 5,000 DM sends per month" },
      { text: "Post now and save drafts" },
      {
        text: "Scheduling not included \u2014 a scheduled post's video waits in storage until it goes out",
        included: false,
      },
      { text: "X not included \u2014 X charges per post", included: false },
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
      { text: "Schedule to any date, on the calendar or from the composer" },
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
      { text: "Schedule to any date, on the calendar or from the composer" },
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
    contact: true,
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

/** The same two paid plans as numbers. The stack calculator does arithmetic
 *  with these, and parsing "$20" back out of a label is a bug waiting for a
 *  currency to change. If these and the rows above disagree, the rows are
 *  what people read and these are the bug. */
export const PRICE = {
  starter: { name: "Starter", monthly: 8, annual: 80 },
  pro: { name: "Pro", monthly: 20, annual: 200 },
  studio: { name: "Studio", monthly: 49, annual: 490 },
} as const;

export type PaidPlanId = keyof typeof PRICE;
