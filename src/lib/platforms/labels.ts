import type { Platform } from "./types";

// Display names for every platform, including ones with no adapter yet — the
// dashboard lists all eight so the user sees what is coming. Registered
// adapters carry their own displayName; this covers the rest and keeps the
// two in agreement.
export const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: "Instagram",
  x: "X",
  threads: "Threads",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
};
