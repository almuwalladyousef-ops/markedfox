import type { Metadata } from "next";

import { Icon } from "@/components/icons";
import { PlatformTile } from "@/components/platform-icon";
import {
  Card,
  CardTitle,
  EmptyState,
  Notice,
  Page,
  PageHeader,
  Pill,
  StickyPane,
  TwoPane,
  UpgradeCard,
  destructiveButtonClass,
  formatCount,
} from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { listConnections } from "@/lib/connections/store";
import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import {
  deleteAllSourcesAction,
  deleteSourceAction,
  syncSourceAction,
} from "@/lib/research/actions";
import { configuredModel } from "@/lib/research/generate";
import {
  isResearchProviderConfigured,
  listResearchProviders,
} from "@/lib/research/providers";
import { listSources } from "@/lib/research/store";
import type { ResearchPlatform } from "@/lib/research/types";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/store";

import { ChannelPicker } from "./channel-picker";

/** The four platforms research reads are all in the publishing registry, so
 *  the mark comes from the same map the rest of the app uses. */
function researchMark(platform: ResearchPlatform) {
  return platform;
}

export const metadata: Metadata = { title: "Channels · MarkedFox" };

// Setup for the whole pillar: which channels this workspace studies. Every
// other research page reads from what is chosen here.

const NOTES: Record<ResearchPlatform, string> = {
  youtube:
    "Reads any public channel, with no connection needed. The richest source, and the only one with real channel search.",
  instagram:
    "Reads any public business or creator account through one of your connected Instagram accounts. Instagram hides view counts here, so likes carry the score.",
  tiktok:
    "TikTok's research API is limited to academic institutions, so apps can only read the connected account's own videos. Track your own TikTok here; use YouTube or Instagram for other creators.",
  x: "Reads any public account's recent posts. X bills per read, so these sources sync less often and pull fewer posts.",
};

export default async function ChannelsPage() {
  const user = await requireUser();
  const active = await getActiveWorkspace();
  if (!active) return <Notice>No workspace is selected.</Notice>;

  const supabase = await createClient();
  const [snapshot, connections] = await Promise.all([
    getEntitlementSnapshot(supabase, user.id, active.id),
    listConnections(supabase, active.id),
  ]);

  const allowed = canUserDo(snapshot, { type: "use_research" });
  if (!allowed.allowed) {
    return (
      <Page>
        <PageHeader title="Channels" />
        <UpgradeCard title="Studio" reason={allowed.reason}>
          Pick the creators worth studying, and MarkedFox watches them for you —
          flagging the videos that beat each channel&rsquo;s own average.
        </UpgradeCard>
      </Page>
    );
  }

  const sources = await listSources(supabase, active.id);
  const connected = new Set(
    connections.filter((c) => c.status === "active").map((c) => c.platform),
  );

  const platforms = listResearchProviders().map((provider) => {
    // "Available" means adding a channel here can actually work: the adapter is
    // configured AND, for the ones that read through an account, that account
    // is connected. A dropdown row that cannot work is still shown, with the
    // sentence explaining why — never hidden.
    const configured = isResearchProviderConfigured(provider);
    const needsConnection = provider.capabilities.requiresConnection;
    return {
      id: provider.platform,
      label: provider.label,
      available: configured && (!needsConnection || connected.has(provider.platform)),
      note: !configured
        ? `${provider.label} research needs ${provider.requiredEnv.join(" and ")} added to this deployment. Nothing is wrong with your account.`
        : needsConnection && !connected.has(provider.platform)
          ? `Connect a ${provider.label} account in this workspace first — research reads through it.`
          : NOTES[provider.platform],
    };
  });

  const defaultPlatform =
    (platforms.find((p) => p.available)?.id as ResearchPlatform | undefined) ??
    "youtube";

  const cap = snapshot.limits.researchSourcesMax;
  const creditsLeft = Math.max(
    0,
    snapshot.limits.researchCreditsPerMonth -
      snapshot.usage.researchCreditsThisMonth,
  );

  return (
    <Page width="max-w-[1180px]">
      <PageHeader
        title="Channels"
        subtitle="Pick which channels to include in your videos feed. Every other research page reads from what is chosen here."
        actions={
          <Pill
            tone={cap !== null && sources.length >= cap ? "warn" : "neutral"}
            className="text-xs"
          >
            {sources.length}
            {cap === null ? "" : ` / ${cap}`} tracked
          </Pill>
        }
      />

      {/* Bases, not floors, decide whether this wraps — see the note in the
          Ideas triage. 520 + 300 clears the width a 1280px window leaves
          beside the rail. */}
      <TwoPane>
        <div className="min-w-[min(100%,460px)] flex-[1_1_520px]">
          <ChannelPicker
            platforms={platforms}
            defaultPlatform={defaultPlatform}
            creditsLeft={creditsLeft}
            aiConfigured={Boolean(configuredModel())}
          />
        </div>

        <StickyPane className="min-w-[280px] flex-[0_1_300px]">
        <Card className="px-5 py-5">
          <CardTitle hint={`refreshes every ${snapshot.limits.researchRefreshHours}h`}>
            Your watchlist
          </CardTitle>

          {sources.length === 0 ? (
            <p className="mt-4 text-[14px] text-faint">
              Nothing here yet. Pick channels on the left.
            </p>
          ) : (
            <ul className="mt-4 flex max-h-[26rem] flex-col gap-1 overflow-y-auto">
              {sources.map((source) => (
                <li
                  key={source.id}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-chip"
                >
                  <span className="relative block h-8 w-8 shrink-0">
                    {source.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={source.thumbnail_url}
                        alt=""
                        loading="lazy"
                        className="h-[30px] w-[30px] rounded-full object-cover"
                      />
                    ) : (
                      <span className="block h-[30px] w-[30px] rounded-full bg-chip" />
                    )}
                    <span className="absolute -right-1 -bottom-1">
                      <PlatformTile
                        platform={researchMark(source.platform)}
                        size={15}
                        radius={999}
                        className="ring-2 ring-panel"
                      />
                    </span>
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-ink">
                      {source.handle ? `@${source.handle}` : source.title}
                    </span>
                    <span className="block text-[12.5px] text-faint">
                      {formatCount(source.follower_count)} followers
                      {source.baseline_views !== null
                        ? ` · typical ${formatCount(source.baseline_views)}`
                        : " · no baseline yet"}
                    </span>
                    {source.last_error ? (
                      <span className="mt-0.5 block text-[12px] text-danger">
                        {source.last_error}
                      </span>
                    ) : null}
                  </span>

                  <form action={syncSourceAction}>
                    <input type="hidden" name="source_id" value={source.id} />
                    <button
                      type="submit"
                      title="Sync now"
                      aria-label={`Sync ${source.title}`}
                      className="rounded p-1.5 text-faint transition-[color] duration-150 hover:text-ink"
                    >
                      <Icon name="refresh" className="h-3.5 w-3.5" />
                    </button>
                  </form>
                  <form action={deleteSourceAction}>
                    <input type="hidden" name="source_id" value={source.id} />
                    <button
                      type="submit"
                      aria-label={`Stop watching ${source.title}`}
                      className="rounded p-1.5 text-faint transition-[color] duration-150 hover:text-danger"
                    >
                      <Icon name="close" className="h-3.5 w-3.5" />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          {/* Removing everything is a real thing people do when they change
              niche, and doing it one row at a time across forty channels is
              why they stop instead. */}
          {sources.length > 1 ? (
            <form action={deleteAllSourcesAction} className="mt-4 border-t border-line pt-3">
              <button type="submit" className={destructiveButtonClass}>
                Remove all
              </button>
            </form>
          ) : null}
        </Card>
        </StickyPane>
      </TwoPane>

      {sources.length === 0 ? (
        <EmptyState title="A baseline needs history">
          Each channel needs a handful of recent videos before MarkedFox can say
          what &ldquo;normal&rdquo; looks like for it. Until then its videos show
          a view count and no multiple, rather than a confident wrong number.
        </EmptyState>
      ) : (
        <p className="text-[13px]/[19px] text-pretty text-faint">
          Each channel needs a handful of recent videos before
          &ldquo;normal&rdquo; means anything — until then its videos show a
          view count and no multiple.
        </p>
      )}
    </Page>
  );
}
