import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export interface OnboardingRow {
  completed: string[];
  dismissed: boolean;
  tenure: string | null;
  audience_size: string | null;
  cadence: string | null;
}

export async function getOnboarding(
  supabase: SupabaseClient,
  userId: string,
): Promise<OnboardingRow | null> {
  const { data, error } = await supabase
    .from("onboarding")
    .select("completed,dismissed,tenure,audience_size,cadence")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    completed: Array.isArray(row.completed)
      ? row.completed.filter((v): v is string => typeof v === "string")
      : [],
    dismissed: row.dismissed === true,
    tenure: (row.tenure as string | null) ?? null,
    audience_size: (row.audience_size as string | null) ?? null,
    cadence: (row.cadence as string | null) ?? null,
  };
}

export async function saveOnboarding(
  supabase: SupabaseClient,
  userId: string,
  patch: Partial<OnboardingRow>,
): Promise<void> {
  const { error } = await supabase.from("onboarding").upsert(
    { user_id: userId, ...patch },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}
