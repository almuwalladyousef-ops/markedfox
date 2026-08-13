import { PlatformNotRegisteredError } from "./errors";
import { instagram } from "./instagram";
import type { Platform, PlatformAdapter } from "./types";

// Adding a platform = one new adapter file + one entry here. Nothing else
// changes: routes resolve adapters through getPlatform(), the composer renders
// PLATFORMS with lock state from canUserDo and capability flags from the
// adapter.
const registry: Partial<Record<Platform, PlatformAdapter>> = {
  instagram,
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
