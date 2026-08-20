import "server-only";

import { listConnections } from "@/lib/connections/store";
import { PLATFORM_LABELS } from "@/lib/platforms/labels";
import { getPlatform, listRegisteredPlatforms } from "@/lib/platforms/registry";
import { createClient } from "@/lib/supabase/server";

export type BuilderAccount = { id: string; name: string; platformLabel: string; ready: boolean };

// The accounts the rule builder can offer in a workspace: connections on a
// platform with DM automation, marked ready when the messaging scopes were
// actually granted (see grantedScopes in the Instagram adapter).
export async function builderAccounts(workspaceId: string): Promise<BuilderAccount[]> {
  const supabase = await createClient();
  const messaging = new Set(listRegisteredPlatforms().filter((a) => a.messaging).map((a) => a.id));
  const connections = await listConnections(supabase, workspaceId);
  return connections
    .filter((c) => messaging.has(c.platform))
    .map((c) => {
      const required = getPlatform(c.platform).messaging?.requiredScopes ?? [];
      return {
        id: c.id,
        name: c.platform_account_name ?? c.platform_account_id,
        platformLabel: PLATFORM_LABELS[c.platform],
        ready: c.status === "active" && required.every((s) => c.scopes.includes(s)),
      };
    });
}
