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

      {/* A "Why is X different?" panel stood here explaining our costs — that
          X bills per post, 13x with a link. Removed 2026-09-07: the cap is
          already on every plan card, and the reason for it is our business
          rather than something a buyer has to read on the way to choosing.
          Stating a limit is honest; justifying it is arguing with somebody who
          has not objected. */}

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
