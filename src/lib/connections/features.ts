import type { PlatformFeature } from "@/lib/platforms/types";

// The optional permission sets a connect can ask for (?features=messaging).
// Shared by the start and callback routes; anything unknown is dropped.
const FEATURES: readonly PlatformFeature[] = ["messaging"];

export function parseFeatures(raw: string | null | undefined): PlatformFeature[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((f) => f.trim())
    .filter((f): f is PlatformFeature => (FEATURES as readonly string[]).includes(f));
}
