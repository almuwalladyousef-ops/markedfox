import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getUser } from "@/lib/auth/session";
import { parseIntendedPlan } from "@/lib/auth/validation";

import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create your account · MarkedFox" };

// /signup?plan=pro|studio — the pricing page's paid CTAs land here. Checkout
// does not exist yet (Stripe is Phase 6), so the choice is carried into the
// account's metadata and acknowledged on screen rather than silently dropped.
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const user = await getUser();
  if (user) redirect("/dashboard");

  const { plan } = await searchParams;
  return <SignupForm plan={parseIntendedPlan(plan)} />;
}
