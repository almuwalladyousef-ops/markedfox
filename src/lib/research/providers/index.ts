// The research provider registry — the same shape as lib/platforms/, and for
// the same reason: adding a platform to research is one new file plus one line
// here, never bespoke code in a route.
//
// Snapchat is absent on purpose. It exposes no public content API of any kind,
// so there is nothing to read. The dashboard says exactly that rather than
// showing a toggle that could never work.

import type { ResearchPlatform, ResearchProvider } from "../types";

import { instagramResearch } from "./instagram";
import { tiktokResearch } from "./tiktok";
import { xResearch } from "./x";
import { youtubeResearch } from "./youtube";

const REGISTRY: Record<ResearchPlatform, ResearchProvider> = {
  youtube: youtubeResearch,
  instagram: instagramResearch,
  x: xResearch,
  tiktok: tiktokResearch,
};

export function getResearchProvider(
  platform: ResearchPlatform,
): ResearchProvider {
  return REGISTRY[platform];
}

export function listResearchProviders(): ResearchProvider[] {
  // Ordered by how much each can actually do, so the UI's first option is the
  // one that works best.
  return [youtubeResearch, instagramResearch, tiktokResearch, xResearch];
}

/** True when this provider's env is present. Providers that read through a
 *  connection need no env and are always "configured" — their gate is whether
 *  a suitable account is connected, checked at call time. */
export function isResearchProviderConfigured(
  provider: ResearchProvider,
  env: Record<string, string | undefined> = process.env,
): boolean {
  return provider.requiredEnv.every((name) => Boolean(env[name]));
}
