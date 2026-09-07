import type { SupabaseClient } from "@supabase/supabase-js";

import type { MediaTab } from "@/lib/accounts/types";
import { PLATFORMS, type Platform } from "@/lib/platforms/types";

// Display preferences: the order things appear in, and nothing else.
//
// These are read on the home screen, so the parser has to be forgiving in both
// directions. A stored list can name a platform that no longer exists (the
// adapter was removed) or be missing one that has just been added, and neither
// is an error — it is a preference written against a different version of the
// product. So `order` filters the unknown out and appends the missing at the
// end, which means a new platform always appears rather than silently
// vanishing for everyone who ever touched this screen.

// Four tabs, and "long" is the odd one: the other three are stored kinds while
// long videos are the same stored kind past a duration. It sits beside them
// here because to the person using the screen it is simply another tab, and
// `order` already appends anything a saved preference has never heard of — so
// this new tab appears for existing users rather than silently vanishing.
export const POST_TYPES: MediaTab[] = ["video", "long", "photo", "text"];

export const POST_TYPE_LABELS: Record<MediaTab, string> = {
  video: "Short videos",
  long: "Long videos",
  photo: "Photos",
  text: "Text posts",
};

export interface Preferences {
  platformOrder: Platform[];
  postTypeOrder: MediaTab[];
}

/**
 * A stored list reconciled against what actually exists: unknown entries
 * dropped, missing ones appended in their canonical order.
 */
export function order<T extends string>(stored: unknown, all: readonly T[]): T[] {
  const known = new Set<string>(all);
  const seen = new Set<string>();
  const out: T[] = [];
  if (Array.isArray(stored)) {
    for (const item of stored) {
      if (typeof item !== "string") continue;
      if (!known.has(item) || seen.has(item)) continue;
      seen.add(item);
      out.push(item as T);
    }
  }
  for (const item of all) if (!seen.has(item)) out.push(item);
  return out;
}

export function parsePreferences(raw: unknown): Preferences {
  const value = (raw ?? {}) as Record<string, unknown>;
  return {
    platformOrder: order(value.platformOrder, PLATFORMS),
    postTypeOrder: order(value.postTypeOrder, POST_TYPES),
  };
}

export interface UserProfile {
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  preferences: Preferences;
}

export async function getProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from("users")
    .select("email, display_name, avatar_url, preferences")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as {
    email: string;
    display_name: string | null;
    avatar_url: string | null;
    preferences: unknown;
  };
  return {
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    preferences: parsePreferences(row.preferences),
  };
}

/** Move one entry one place. Returns a new array; out-of-range is a no-op, so
 *  the buttons at the ends of a list need no special case. */
export function move<T>(list: T[], from: number, delta: number): T[] {
  const to = from + delta;
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
