"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { saveOnboarding, type OnboardingRow } from "./store";
import { isValidAnswer, QUESTIONS } from "./steps";

// The checklist's two actions. Both write only the acting user's own row, and
// RLS refuses anything else regardless of what the form said.

export async function dismissOnboardingAction(): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  await saveOnboarding(supabase, user.id, { dismissed: true });
  revalidatePath("/dashboard");
}

/**
 * The three tuning questions.
 *
 * Every answer is checked against the list it came from — not because a wrong
 * one would do damage, but because a value nothing reads is a value that will
 * confuse whoever queries this table in six months.
 */
export async function saveOnboardingAnswersAction(
  formData: FormData,
): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();

  const patch: Partial<OnboardingRow> = {};
  for (const question of QUESTIONS) {
    const raw = formData.get(question.key);
    if (typeof raw !== "string" || !raw) continue;
    if (!isValidAnswer(question.key, raw)) continue;
    if (question.key === "tenure") patch.tenure = raw;
    if (question.key === "audience_size") patch.audience_size = raw;
    if (question.key === "cadence") patch.cadence = raw;
  }

  // The row is written even when nothing was answered: it is what records that
  // the questions were ASKED, and without it they would come back next visit.
  await saveOnboarding(supabase, user.id, {
    ...patch,
    completed: ["questions"],
  });
  revalidatePath("/dashboard");
}
