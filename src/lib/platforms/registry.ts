import { PlatformNotRegisteredError } from "./errors";
import { facebook } from "./facebook";
import { instagram } from "./instagram";
import { snapchat } from "./snapchat";
import { threadsAdapter } from "./threads";
import { tiktokAdapter } from "./tiktok";
import { x } from "./x";
import { youtube } from "./youtube";
import type { Platform, PlatformAdapter } from "./types";

// Adding a platform = one new adapter file + one entry here. Nothing else
// changes: routes resolve adapters through getPlatform(), the composer renders
// PLATFORMS with lock state from canUserDo and capability flags from the
// adapter.
const registry: Partial<Record<Platform, PlatformAdapter>> = {
  instagram,
  x,
  facebook,
  threads: threadsAdapter,
  tiktok: tiktokAdapter,
  youtube,
  snapchat,
};

export function getPlatform(id: Platform): PlatformAdapter {
  const adapter = registry[id];
  if (!adapter) {
    throw new PlatformNotRegisteredError(id);
  }
  return adapter;
}

export function listRegisteredPlatforms(): PlatformAdapter[] {
  return Object.values(registry);
}
