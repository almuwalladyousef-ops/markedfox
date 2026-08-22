import type { Metadata } from "next";
import Link from "next/link";

import { LocalTime } from "@/components/local-time";
import { PlatformIcon } from "@/components/platform-icon";
import {
  Button,
  ButtonLink,
  EmptyState,
  Notice,
  Page,
  chipToggle,
  formatCount,
  segmentedItem,
  segmentedTrack,
} from "@/components/ui";
import { refreshAccountsAction } from "@/lib/accounts/actions";
import {
  listAccountMedia,
  listAccountProfiles,
  totalsFrom,
} from "@/lib/accounts/store";
import type { AccountMediaRow, AccountProfileRow } from "@/lib/accounts/types";
import { signOut } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/session";
import { listConnections, type ConnectionRow } from "@/lib/connections/store";
import { PLATFORM_LABELS } from "@/lib/platforms/labels";
import { getPlatform } from "@/lib/platforms/registry";
import { PLATFORMS, type AccountMediaKind, type Platform } from "@/lib/platforms/types";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/store";

import { AutoFill } from "./auto-fill";

export const metadata: Metadata = { title: "Home · MarkedFox" };

// The first screen: everything the user has, everywhere, before anything the
// product wants them to do.
//
// It opens on the total — posts, followers, following across every connected
// account at once — and then the same grid narrowed to one platform. The posts
// are the real ones from each platform, not our record of what we published:
// somebody who posted from their phone this morning should see it here, or the
// screen is lying about being their account.
//
// Nothing here calls a platform. Everything is read from the cache that
// lib/accounts/sync.ts fills, because these reads are rate-limited per app and,
// on X, billed per request — a page that refreshed on every load would spend
// every user's share of one shared budget on people idly reloading.

const KINDS: { id: AccountMediaKind | null; label: string }[] = [
  { id: null, label: "All" },
  { id: "video", label: "Short videos" },
  { id: "photo", label: "Photos" },
  { id: "text", label: "Text posts" },
];

function parsePlatform(value: string | undefined): Platform | null {
  return PLATFORMS.includes(value as Platform) ? (value as Platform) : null;
}

function parseKind(value: string | undefined): AccountMediaKind | null {
  return value === "video" || value === "photo" || value === "text" ? value : null;
}

function href(params: {
  platform?: Platform | null;
  kind?: AccountMediaKind | null;
  page?: number;
}): string {
  const search = new URLSearchParams();
  if (params.platform) search.set("platform", params.platform);
  if (params.kind) search.set("kind", params.kind);
  if (params.page) search.set("page", String(params.page));
  const query = search.toString();
  return query ? `/dashboard?${query}` : "/dashboard";
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ platform?: string; kind?: string; page?: string }>;
}) {
  const params = await searchParams;
  const user = await requireUser();
  const active = await getActiveWorkspace();

  if (!active) {
    // Two ways to be here: the signup trigger never ran, or the account was
    // deleted while this browser still held a session — a JWT verifies locally
    // until it expires, so the cookie outlives the user.
    const supabaseForCheck = await createClient();
    const { data: userRow } = await supabaseForCheck
      .from("users")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    return (
      <Page width="max-w-2xl">
        <h1 className="font-display text-[26px] font-bold tracking-[-0.02em]">
          {userRow ? "Account setup incomplete" : "This account no longer exists"}
        </h1>
        <p className="text-[13.5px]/[20px] text-muted">
          {userRow
            ? "No workspace exists for this account. Contact support@markedfox.com."
            : "It was deleted. Sign out to clear this browser's session."}
        </p>
        <form action={signOut}>
          <Button type="submit">Sign out</Button>
        </form>
      </Page>
    );
  }

  const platform = parsePlatform(params.platform);
  const kind = parseKind(params.kind);
  const page = Math.max(0, Math.min(20, Number(params.page ?? 0) || 0));

  const supabase = await createClient();
  const [connections, profiles, media] = await Promise.all([
    listConnections(supabase, active.id),
    listAccountProfiles(supabase, active.id),
    listAccountMedia(supabase, active.id, { platform, kind, page }),
  ]);

  const totals = totalsFrom(profiles);
  const byConnection = new Map(profiles.map((row) => [row.connectionId, row]));
  const accounts = connections.map((connection) => ({
    connection,
    profile: byConnection.get(connection.id) ?? null,
  }));

  // Connected accounts we have never managed to read. The sweep reaches them
  // within the hour, but somebody who connected an account thirty seconds ago
  // should not stare at an empty screen until then.
  const unread = accounts.filter(
    ({ connection, profile }) =>
      profile === null && readable(connection.platform) !== "none",
  ).length;

  // A read that failed is worth a sentence at the top rather than a quiet dash
  // in a chip: the fix — reconnect the account — is not something anybody
  // guesses from a missing number.
  const failed = accounts.filter(({ profile }) => profile?.lastError);

  const connectedPlatforms = [
    ...new Set(connections.map((connection) => connection.platform)),
  ];
  const hasMetered = connectedPlatforms.some(
    (id) => readable(id) === "metered",
  );
  const lastSynced = profiles
    .map((row) => row.lastSyncedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  if (connections.length === 0) {
    return (
      <Page width="max-w-[1120px]">
        <Header
          name={active.name}
          totals={totals}
          accounts={accounts}
          lastSynced={undefined}
          hasMetered={false}
        />
        <EmptyState
          title="Nothing connected yet"
          action={
            <ButtonLink href="/dashboard/accounts" tone="primary">
              Connect an account
            </ButtonLink>
          }
        >
          Connect Instagram, TikTok, YouTube or any of the others and this
          screen fills with your own posts and your own numbers — including the
          ones you posted from your phone.
        </EmptyState>
      </Page>
    );
  }

  return (
    <Page width="max-w-[1120px]">
      {unread > 0 ? <AutoFill /> : null}

      <Header
        name={active.name}
        totals={totals}
        accounts={accounts}
        lastSynced={lastSynced}
        hasMetered={hasMetered}
      />

      {failed.length > 0 ? (
        <Notice tone="warn">
          {readFailureNotice(failed)}{" "}
          <Link href="/dashboard/accounts" className="underline">
            Manage accounts
          </Link>
        </Notice>
      ) : null}

      <AccountStrip accounts={accounts} />

      <div className="flex flex-wrap items-center gap-2">
        <nav className="flex flex-wrap gap-1.5">
          <Link
            href={href({ kind })}
            aria-current={platform === null ? "page" : undefined}
            className={chipToggle(platform === null)}
          >
            All platforms
          </Link>
          {connectedPlatforms.map((id) => (
            <Link
              key={id}
              href={href({ platform: id, kind })}
              aria-current={platform === id ? "page" : undefined}
              className={chipToggle(platform === id, "inline-flex items-center gap-1.5")}
            >
              <PlatformIcon platform={id} />
              {PLATFORM_LABELS[id]}
            </Link>
          ))}
        </nav>

        <div className={`ml-auto ${segmentedTrack}`}>
          {KINDS.map((option) => (
            <Link
              key={option.label}
              href={href({ platform, kind: option.id })}
              aria-current={kind === option.id ? "page" : undefined}
              className={segmentedItem(kind === option.id)}
            >
              {option.label}
            </Link>
          ))}
        </div>
      </div>

      {media.items.length === 0 ? (
        <EmptyState
          title={unread > 0 ? "Reading your accounts…" : "Nothing to show yet"}
          action={
            <ButtonLink href="/dashboard/compose" tone="primary">
              Compose a post
            </ButtonLink>
          }
        >
          {unread > 0
            ? "This takes a few seconds the first time. The page fills itself when the accounts answer."
            : platform || kind
              ? "No posts match this filter. Try another platform or post type."
              : "Once these accounts have posts, they appear here — the ones you publish from MarkedFox and the ones you do not."}
        </EmptyState>
      ) : (
        <>
          <MediaGrid items={media.items} accounts={accounts} />
          {media.hasMore ? (
            <div className="flex justify-center">
              <ButtonLink href={href({ platform, kind, page: page + 1 })} tone="secondary">
                Load more
              </ButtonLink>
            </div>
          ) : null}
        </>
      )}
    </Page>
  );
}

type AccountEntry = { connection: ConnectionRow; profile: AccountProfileRow | null };

/** One sentence about the accounts that could not be read. Several accounts
 *  failing for the same reason — an expired app secret, say — say it once with
 *  the names, not the same paragraph three times. */
function readFailureNotice(failed: AccountEntry[]): string {
  const byMessage = new Map<string, string[]>();
  for (const { connection, profile } of failed) {
    const message = profile?.lastError ?? "";
    const names = byMessage.get(message) ?? [];
    names.push(PLATFORM_LABELS[connection.platform]);
    byMessage.set(message, names);
  }

  return [...byMessage.entries()]
    .map(([message, names]) =>
      failed.length === 1 ? message : `${names.join(", ")}: ${message}`,
    )
    .join(" ");
}


/** What this deployment can read for a platform, in the three states the
 *  screen has to say something different about. */
function readable(platform: Platform): "yes" | "metered" | "none" {
  try {
    const insights = getPlatform(platform).insights;
    if (!insights) return "none";
    return insights.metered ? "metered" : "yes";
  } catch {
    return "none";
  }
}

function Header({
  name,
  totals,
  accounts,
  lastSynced,
  hasMetered,
}: {
  name: string;
  totals: ReturnType<typeof totalsFrom>;
  accounts: AccountEntry[];
  lastSynced: string | undefined;
  hasMetered: boolean;
}) {
  return (
    <header className="flex flex-wrap items-start gap-5">
      <AvatarStack accounts={accounts} />

      <div className="min-w-[240px] flex-1">
        <h1 className="font-display text-[26px]/[32px] font-bold tracking-[-0.02em] text-ink">
          {name}
        </h1>
        <dl className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[13.5px] text-muted">
          <div className="flex items-baseline gap-1.5">
            <dt className="order-2">total posts</dt>
            <dd className="order-1 font-display text-[17px] font-bold text-ink">
              {formatCount(totals.posts)}
            </dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="order-2">total followers</dt>
            <dd className="order-1 font-display text-[17px] font-bold text-ink">
              {formatCount(totals.followers)}
            </dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="order-2">total following</dt>
            <dd className="order-1 font-display text-[17px] font-bold text-ink">
              {formatCount(totals.following)}
            </dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="order-2">
              {totals.accounts === 1 ? "account" : "accounts"}
            </dt>
            <dd className="order-1 font-display text-[17px] font-bold text-ink">
              {totals.accounts}
            </dd>
          </div>
        </dl>
        {lastSynced ? (
          <p className="mt-1.5 text-[11.5px] text-faint">
            Last read <LocalTime value={lastSynced} fallback="recently" />
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <form action={refreshAccountsAction}>
          <Button type="submit" tone="secondary" size="sm">
            Refresh
          </Button>
        </form>
        {/* X bills per request, so its refresh is a separate press with the
            cost said out loud rather than a surprise on an invoice. */}
        {hasMetered ? (
          <form action={refreshAccountsAction}>
            <input type="hidden" name="include_metered" value="1" />
            <Button
              type="submit"
              tone="ghost"
              size="sm"
              title="X charges per read, so it refreshes only when you ask"
            >
              Refresh including X
            </Button>
          </form>
        ) : null}
        <ButtonLink href="/dashboard/accounts" tone="ghost" size="sm">
          Manage accounts
        </ButtonLink>
        <ButtonLink href="/dashboard/compose" tone="primary" size="sm">
          + New post
        </ButtonLink>
      </div>
    </header>
  );
}

function AvatarStack({ accounts }: { accounts: AccountEntry[] }) {
  const shown = accounts.slice(0, 4);
  return (
    <div className="flex items-center -space-x-3">
      {shown.map(({ connection, profile }) => (
        <span
          key={connection.id}
          title={profile?.displayName ?? connection.platform_account_name ?? undefined}
          className="relative inline-flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-2 border-panel bg-chip"
        >
          {profile?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatarUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <PlatformIcon platform={connection.platform} className="h-5 w-5 text-muted" />
          )}
        </span>
      ))}
      {accounts.length > shown.length ? (
        <span className="relative inline-flex h-14 w-14 items-center justify-center rounded-full border-2 border-panel bg-chip text-[13px] font-semibold text-muted">
          +{accounts.length - shown.length}
        </span>
      ) : null}
    </div>
  );
}

function AccountStrip({ accounts }: { accounts: AccountEntry[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {accounts.map(({ connection, profile }) => {
        const state = readable(connection.platform);
        const name =
          profile?.handle ??
          profile?.displayName ??
          connection.platform_account_name ??
          connection.platform_account_id;
        // Three different silences, and they mean different things: a platform
        // with no read API at all, one that costs money to read, and one that
        // refused us. Each says which, rather than all showing an empty number.
        const note =
          profile?.lastError ??
          (state === "none"
            ? `${PLATFORM_LABELS[connection.platform]} has no API for reading an account's own posts.`
            : state === "metered" && !profile
              ? "X charges per read — press Refresh including X to pull it in."
              : null);

        return (
          <li key={connection.id}>
            <span
              className="inline-flex items-center gap-2 rounded-full bg-chip py-1 pr-3 pl-1 text-[12px] text-muted"
              title={note ?? undefined}
            >
              <span className="inline-flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-panel">
                {profile?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <PlatformIcon platform={connection.platform} className="h-3 w-3" />
                )}
              </span>
              <PlatformIcon platform={connection.platform} className="h-3 w-3" />
              <span className="font-medium text-ink">{name}</span>
              <span>{formatCount(profile?.followers)}</span>
              {note ? (
                <span className="text-warn" title={note}>
                  ⚠
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function MediaGrid({
  items,
  accounts,
}: {
  items: AccountMediaRow[];
  accounts: AccountEntry[];
}) {
  const metricFor = new Map(
    accounts
      .filter((entry) => entry.profile)
      .map((entry) => [entry.connection.id, entry.profile!.primaryMetric]),
  );

  return (
    <ul className="grid grid-cols-2 gap-2.5 shell:grid-cols-3 wide:grid-cols-4">
      {items.map((item) => {
        const metric = metricFor.get(item.connectionId) ?? "views";
        const headline = metric === "views" ? item.views : item.likes;
        return (
          <li key={item.id}>
            <a
              href={item.permalink ?? "#"}
              target={item.permalink ? "_blank" : undefined}
              rel="noreferrer"
              className="group block overflow-hidden rounded-[14px] border border-line bg-panel transition hover:border-line-strong"
            >
              <div className="relative aspect-[9/13] bg-chip">
                {item.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.thumbnailUrl}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  // A text post has no picture, so it shows its own words —
                  // an empty grey tile would read as a broken image. The right
                  // padding keeps the last line clear of the platform badge.
                  <p className="line-clamp-[9] py-3 pr-9 pl-3.5 text-[12.5px]/[18px] text-ink">
                    {item.caption?.trim() || "No text"}
                  </p>
                )}

                <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-1 text-white backdrop-blur-[2px]">
                  <PlatformIcon
                    platform={item.platform}
                    title={PLATFORM_LABELS[item.platform]}
                  />
                </span>

                <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur-[2px]">
                  <span aria-hidden>{metric === "views" ? "▶" : "♥"}</span>
                  {formatCount(headline)}
                  <span className="sr-only">{metric}</span>
                </span>
              </div>

              <div className="px-2.5 py-2">
                {/* A text post already shows its words in the tile above;
                    repeating them under it is the same sentence twice. */}
                {item.kind === "text" ? null : (
                  <p className="line-clamp-2 text-[12px]/[17px] text-muted group-hover:text-ink">
                    {item.caption?.trim() || "No caption"}
                  </p>
                )}
                {item.postedAt ? (
                  <p className="mt-1 text-[10.5px] text-faint">
                    <LocalTime value={item.postedAt} mode="date" />
                  </p>
                ) : null}
              </div>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
