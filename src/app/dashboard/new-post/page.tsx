import type { Metadata } from "next";
import Link from "next/link";

import { Card, Page } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { listConnections } from "@/lib/connections/store";
import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import { isMediaStorageConfigured } from "@/lib/media/store";
import { PLATFORM_LABELS } from "@/lib/platforms/labels";
import { listRegisteredPlatforms } from "@/lib/platforms/registry";
import { PLATFORMS } from "@/lib/platforms/types";
import { getPost } from "@/lib/publish/store";
import { listContentSpecs, listOptionSpecs } from "@/lib/publish/specs";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/store";

import { Composer, type ComposerAccount, type PlatformGate } from "./composer";

export const metadata: Metadata = { title: "New post · MarkedFox" };

// Server half of the composer: reads what the client needs through the user's
// own client (RLS) and hands it over as plain props. The rules the client
// validates with are the adapters' own — the same ones POST /api/posts
// enforces — so the composer can never be more permissive than the API.
export default async function ComposePage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
  const { draft: draftId } = await searchParams;
  const user = await requireUser();
  const active = await getActiveWorkspace();
  if (!active) {
    return (
      <Page width="max-w-2xl">
        <h1 className="font-display text-[26px] font-bold tracking-[-0.02em]">
          Account setup incomplete
        </h1>
        <p className="text-[13.5px] text-muted">
          No workspace exists for this account.
        </p>
      </Page>
    );
  }

  const supabase = await createClient();
  const [snapshot, connections] = await Promise.all([
    getEntitlementSnapshot(supabase, user.id, active.id),
    listConnections(supabase, active.id),
  ]);
  const specs = listContentSpecs();
  const optionSpecs = listOptionSpecs();

  // Reopening a draft. RLS scopes the read, and a row that is no longer a
  // draft is ignored rather than reopened — publishing it again from a stale
  // tab would double-post.
  const draftRow =
    draftId && /^[0-9a-f-]{36}$/i.test(draftId)
      ? await getPost(supabase, draftId)
      : null;
  const draft =
    draftRow && draftRow.status === "draft"
      ? {
          id: draftRow.id,
          caption: draftRow.caption,
          media: draftRow.media,
          targetConnectionIds: draftRow.target_connection_ids,
          platformOverrides: draftRow.platform_overrides as Record<
            string,
            { caption?: string; options?: Record<string, string | number | boolean> }
          >,
          scheduledFor: draftRow.scheduled_for,
        }
      : undefined;

  const accounts: ComposerAccount[] = connections.map((c) => ({
    id: c.id,
    platform: c.platform,
    name: c.platform_account_name ?? c.platform_account_id,
    status: c.status,
    publishable: Boolean(specs[c.platform]),
  }));

  // Structural plan gate per platform (is it on this plan at all?). Caps that
  // move with usage are shown as counters and re-checked by the API.
  const gates: Partial<Record<string, PlatformGate>> = {};
  for (const platform of new Set(connections.map((c) => c.platform))) {
    const decision = canUserDo(snapshot, { type: "publish_post", platform });
    if (!decision.allowed && decision.code === "plan_platform_locked") {
      gates[platform] = { code: decision.code, message: decision.reason };
    }
  }

  // Platforms with no account connected here. Shown in the composer rather
  // than hidden, so the grid is the whole list of what the product does and a
  // missing one is a click rather than a discovery problem.
  const connectedPlatforms = new Set(connections.map((c) => c.platform));
  const buildable = new Set(
    listRegisteredPlatforms()
      .filter((a) => a.requiredEnv.every((name) => Boolean(process.env[name])))
      .map((a) => a.id),
  );
  const connectable = PLATFORMS.filter(
    (platform) => !connectedPlatforms.has(platform),
  ).map((platform) => ({
    platform,
    label: PLATFORM_LABELS[platform],
    reason: buildable.has(platform)
      ? undefined
      : `${PLATFORM_LABELS[platform]} is not configured on this deployment yet.`,
  }));

  return (
    // The composer draws its own "‹ New post" header, because the back arrow
    // belongs beside the title rather than above a page frame.
    <Page width="max-w-[1120px]">
      {accounts.length === 0 ? (
        <Card className="p-6">
          <p className="text-[13.5px] text-muted">
            No accounts are connected in this workspace yet.{" "}
            <Link href="/dashboard/settings/accounts" className="text-accent underline">
              Connect one on the dashboard
            </Link>{" "}
            and come back.
          </p>
        </Card>
      ) : (
        <Composer
          workspaceId={active.id}
          accounts={accounts}
          specs={specs}
          optionSpecs={optionSpecs}
          connectable={connectable}
          draft={draft}
          labels={PLATFORM_LABELS}
          gates={gates}
          planId={snapshot.planId}
          xLinksAllowed={snapshot.limits.xLinksAllowed}
          uploadsEnabled={isMediaStorageConfigured()}
          usage={{
            postsToday: snapshot.usage.postsToday,
            postsPerDay: snapshot.limits.postsPerDay,
            xPostsThisMonth: snapshot.usage.xPostsThisMonth,
            xPostsPerMonth: snapshot.limits.xPostsPerMonth,
          }}
        />
      )}
    </Page>
  );
}
