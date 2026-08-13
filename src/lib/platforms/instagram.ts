import { NotImplementedError } from "./errors";
import type { PlatformAdapter } from "./types";

// Phase 3 vertical slice. Instagram Graph API via the Meta Business app:
// works in Development mode for accounts holding an app role (posts publicly,
// full API access including messaging) before App Review passes — see the
// platform reality table in CLAUDE.md.
export const instagram: PlatformAdapter = {
  id: "instagram",
  displayName: "Instagram",
  capabilities: {
    text: false, // no text-only posts on Instagram
    image: true,
    video: true,
    carousel: true,
    schedule: true,
    analytics: true,
  },
  getAuthorizeUrl() {
    throw new NotImplementedError("instagram.getAuthorizeUrl");
  },
  async connect() {
    throw new NotImplementedError("instagram.connect");
  },
  async refresh() {
    throw new NotImplementedError("instagram.refresh");
  },
  async publish() {
    throw new NotImplementedError("instagram.publish");
  },
};
