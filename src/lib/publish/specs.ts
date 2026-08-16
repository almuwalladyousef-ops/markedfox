import { listRegisteredPlatforms } from "@/lib/platforms/registry";
import type { Platform, PlatformAdapter } from "@/lib/platforms/types";

import type { PlatformContentSpec } from "./validate";

// The serialisable slice of an adapter that validation needs. Server code
// builds these from the registry and hands them to the composer as props, so
// the browser validates with the same numbers the API enforces and never
// imports an adapter.

export function toContentSpec(adapter: PlatformAdapter): PlatformContentSpec {
  return {
    id: adapter.id,
    displayName: adapter.displayName,
    capabilities: adapter.capabilities,
    rules: adapter.rules,
  };
}

// Only registered platforms have a spec — an unregistered one cannot be
// connected, so it can never be a target either.
export type ContentSpecs = Partial<Record<Platform, PlatformContentSpec>>;

export function listContentSpecs(): ContentSpecs {
  const out: ContentSpecs = {};
  for (const adapter of listRegisteredPlatforms()) {
    out[adapter.id] = toContentSpec(adapter);
  }
  return out;
}
