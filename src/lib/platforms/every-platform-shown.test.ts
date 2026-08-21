import { describe, expect, it } from "vitest";

import { PLATFORM_LABELS } from "./labels";
import { listRegisteredPlatforms } from "./registry";
import { PLATFORMS } from "./types";

// The house rule, pinned.
//
// Nothing the product supports is ever hidden or rendered as a dead label. A
// platform the plan excludes, one the workspace has no room for, and one this
// deployment has no keys for all render as the same toggle — pressing it says
// which and what to do. The tempting alternative ("Coming soon", greyed out)
// tells the user nothing they can act on, hides half the product from somebody
// deciding whether to pay for it, and becomes a lie the day the keys land.

describe("every platform is offered", () => {
  it("has a label, so none can render as a blank row", () => {
    for (const platform of PLATFORMS) {
      expect(PLATFORM_LABELS[platform], platform).toBeTruthy();
    }
  });

  it("declares what it needs, so the UI can say what is missing", () => {
    // requiredEnv is what turns "not available" into a sentence naming the
    // key. An adapter that declared nothing would leave the toggle unable to
    // explain itself.
    for (const adapter of listRegisteredPlatforms()) {
      expect(Array.isArray(adapter.requiredEnv), adapter.id).toBe(true);
      for (const name of adapter.requiredEnv) {
        expect(name, adapter.id).toMatch(/^[A-Z][A-Z0-9_]*$/);
      }
    }
  });

  it("never registers an adapter the platform list does not know about", () => {
    // The dashboard builds its rows by mapping over PLATFORMS, so an adapter
    // whose id is not in that list would be a platform the product can publish
    // to and never shows. The reverse is fine — a platform with no adapter yet
    // renders as a toggle that explains itself.
    const known = new Set<string>(PLATFORMS);
    for (const adapter of listRegisteredPlatforms()) {
      expect(known.has(adapter.id), adapter.id).toBe(true);
    }
  });
});
