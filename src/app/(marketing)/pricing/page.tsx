import type { Metadata } from "next";

import Link from "next/link";

import { PLANS } from "../_components/plans-data";
import { PlanGrid } from "./plan-grid";

export const metadata: Metadata = {
  title: "Pricing · MarkedFox",
  description:
    "Free to start. Pro $20/month, Studio $49/month, two months free on annual billing.",
};

// The plan rows live in ../_components/plans-data so the landing page's plan
// comparison and this page read the same numbers.

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

      <div className="mx-auto mt-12 max-w-2xl rounded-lg border border-line bg-panel p-5 text-[13px]/[20px] text-muted">
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
          className="text-accent transition-opacity duration-110 hover:opacity-75"
        >
          support@markedfox.com
        </Link>
      </p>
    </main>
  );
}
