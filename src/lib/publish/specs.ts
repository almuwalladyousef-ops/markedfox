import {
  PUBLISH_OPTIONS,
  validatePublishOptions,
  type PlatformOptionSpec,
} from "@/lib/platforms/publish-options";
import { listRegisteredPlatforms } from "@/lib/platforms/registry";
import type {
  Platform,
  PlatformAdapter,
  PlatformPublishOptions,
} from "@/lib/platforms/types";

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

/** The option declarations for the platforms that have any, for the composer. */
export type OptionSpecs = Partial<Record<Platform, PlatformOptionSpec>>;

export function listOptionSpecs(): OptionSpecs {
  const out: OptionSpecs = {};
  for (const adapter of listRegisteredPlatforms()) {
    const spec = PUBLISH_OPTIONS[adapter.id];
    if (spec) out[adapter.id] = spec;
  }
  return out;
}

/**
 * Every reason these options are unusable: the declarative checks from
 * publish-options.ts plus whatever the adapter itself insists on.
 *
 * One function because there are two callers — createPost and publishPost —
 * and a rule enforced in one but not the other is a rule that holds until the
 * scheduler runs.
 */
export function validateOptionsFor(
  adapter: PlatformAdapter,
  options: PlatformPublishOptions | undefined,
  context: Record<string, unknown> | null,
  input: { hasVideo?: boolean },
): string[] {
  return [
    ...validatePublishOptions(adapter.id, options),
    ...(adapter.validateOptions
      ? adapter.validateOptions(options, context, input)
      : []),
  ];
}
