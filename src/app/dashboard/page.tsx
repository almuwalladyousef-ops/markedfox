import type { Metadata } from "next";
import Link from "next/link";

import { LocalTime } from "@/components/local-time";
import { PlatformBadge, PlatformIcon } from "@/components/platform-icon";
import {
  Button,
  ButtonLink,
  EmptyState,
  Notice,
  Page,
  cx,
  formatCount,
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
import type { AccountMediaKind, Platform } from "@/lib/platforms/types";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/store";

import { AutoFill } from "./auto-fill";

export const metadata: Metadata = { title: "Home · MarkedFox" };

// The first screen: everything the user has, everywhere, before anything the
// product wants them to do.
//
// It opens on the total — posts, followers, following across every connected
// account at once — and the ‹ › arrows walk through the accounts one at a
// time, so the same screen answers "how am I doing overall" and "how is this
// account doing". The grid is the real posts on those accounts, not our record
// of what we published: somebody who posted from their phone this morning
// should see it here, or the screen is lying about being their account.
//
// Nothing here calls a platform. Everything is read from the cache that
// lib/accounts/sync.ts fills, because these reads are rate-limited per app and,
// on X, billed per request — a page that refreshed on every load would spend
// every user's share of one shared budget on people idly reloading.

const KINDS: { id: AccountMediaKind | null; label: string; icon: string }[] = [
  { id: null, label: "All", icon: "▦" },
  { id: "video", label: "Short videos", icon: "▶" },
  { id: "photo", label: "Photos", icon: "◲" },
  { id: "text", label: "Text posts", icon: "☰" },
];

function parseKind(value: string | undefined): AccountMediaKind | null {
  return value === "video" || value === "photo" || value === "text" ? value : null;
}

function href(params: {
  account?: string | null;
  kind?: AccountMediaKind | null;
  page?: number;
}): string {
  const search = new URLSearchParams();
  if (params.account) search.set("account", params.account);
  if (params.kind) search.set("kind", params.kind);
  if (params.page) search.set("page", String(params.page));
  const query = search.toString();
  return query ? `/dashboard?${query}` : "/dashboard";
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; kind?: string; page?: string }>;
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

  const kind = parseKind(params.kind);
  const page = Math.max(0, Math.min(20, Number(params.page ?? 0) || 0));

  const supabase = await createClient();
  const [connections, profiles] = await Promise.all([
    listConnections(supabase, active.id),
    listAccountProfiles(supabase, active.id),
  ]);

  const byConnection = new Map(profiles.map((row) => [row.connectionId, row]));
  const accounts: AccountEntry[] = connections.map((connection) => ({
    connection,
    profile: byConnection.get(connection.id) ?? null,
  }));

  // The carousel: "all" plus one stop per connected account, in the order they
  // were connected, so ‹ › always walks the same ring.
  const selectedId =
    params.account && accounts.some((a) => a.connection.id === params.account)
      ? params.account
      : null;
  const ring: (string | null)[] = [null, ...accounts.map((a) => a.connection.id)];
  const at = ring.indexOf(selectedId);
  const previous = ring[(at - 1 + ring.length) % ring.length];
  const next = ring[(at + 1) % ring.length];
  const current = accounts.find((a) => a.connection.id === selectedId) ?? null;

  const media = await listAccountMedia(supabase, active.id, {
    platform: null,
    connectionId: selectedId,
    kind,
    page,
  });

  const shown = current ? [current] : accounts;
  const totals = totalsFrom(
    shown.map((entry) => entry.profile).filter(Boolean) as AccountProfileRow[],
  );

  // Connected accounts we have never managed to read. The sweep reaches them
  // within the hour, but somebody who connected an account thirty seconds ago
  // should not stare at an empty screen until then.
  const unread = accounts.filter(
    ({ connection, profile }) =>
      profile === null && readable(connection.platform) !== "none",
  ).length;
  const failed = accounts.filter(({ profile }) => profile?.lastError);
  const hasMetered = accounts.some(
    ({ connection }) => readable(connection.platform) === "metered",
  );
  const lastSynced = profiles
    .map((row) => row.lastSyncedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  if (connections.length === 0) {
    return (
      <Page width="max-w-[1080px]">
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

  const title = current
    ? (current.profile?.displayName ??
      current.connection.platform_account_name ??
      PLATFORM_LABELS[current.connection.platform])
    : active.name;

  return (
    <Page width="max-w-[1080px]">
      {unread > 0 ? <AutoFill /> : null}

      {failed.length > 0 ? (
        <Notice tone="warn">
          {readFailureNotice(failed)}{" "}
          <Link href="/dashboard/accounts" className="underline">
            Manage accounts
          </Link>
        </Notice>
      ) : null}

      {/* ── the profile header ───────────────────────────────────────────── */}
      <header className="flex flex-col items-center gap-5 pt-2 wide:flex-row wide:items-start wide:gap-8">
        <div className="flex items-center gap-1.5">
          <ArrowLink href={href({ account: previous, kind })} direction="prev" />
          <AvatarStack accounts={shown} />
          <ArrowLink href={href({ account: next, kind })} direction="next" />
        </div>

        <div className="min-w-0 flex-1 text-center wide:text-left">
          <div className="flex flex-wrap items-center justify-center gap-2.5 wide:justify-start">
            <h1 className="font-display text-[26px]/[32px] font-bold tracking-[-0.02em] text-ink">
              {title}
            </h1>
            <ButtonLink href="/dashboard/drafts" tone="secondary" size="sm">
              Drafts
            </ButtonLink>
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
                  Include X
                </Button>
              </form>
            ) : null}
          </div>

          <dl className="mt-3 flex flex-wrap items-baseline justify-center gap-x-6 gap-y-1 text-[13.5px] text-muted wide:justify-start">
            <Total label="total posts" value={totals.posts} />
            <Total label="total followers" value={totals.followers} />
            <Total label="total following" value={totals.following} />
          </dl>

          {current ? (
            <div className="mt-3 text-[13.5px]/[20px]">
              <p className="font-semibold text-ink">
                {current.profile?.handle ??
                  current.connection.platform_account_name ??
                  current.connection.platform_account_id}
              </p>
              {current.profile?.bio ? (
                <p className="mt-1 max-w-md text-muted">{current.profile.bio}</p>
              ) : null}
              {current.profile?.profileUrl ? (
                <a
                  href={current.profile.profileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-faint underline-offset-2 hover:text-ink hover:underline"
                >
                  {current.profile.profileUrl.replace(/^https?:\/\//, "")}
                </a>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-[12.5px] text-faint">
              Every connected account together.{" "}
              {lastSynced ? (
                <>
                  Last read <LocalTime value={lastSynced} fallback="recently" />.
                </>
              ) : null}
            </p>
          )}
        </div>
      </header>

      {/* ── what kind of post ────────────────────────────────────────────── */}
      <nav className="flex justify-center gap-1 pt-1">
        {KINDS.map((option) => {
          const on = kind === option.id;
          return (
            <Link
              key={option.label}
              href={href({ account: selectedId, kind: option.id })}
              aria-current={on ? "page" : undefined}
              className={cx(
                "inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold transition",
                on ? "bg-ink text-panel" : "text-muted hover:bg-chip hover:text-ink",
              )}
            >
              <span aria-hidden className="text-[12px]">
                {option.icon}
              </span>
              {option.label}
            </Link>
          );
        })}
      </nav>

      {media.items.length === 0 ? (
        <EmptyState
          title={unread > 0 ? "Reading your accounts…" : "Nothing to show yet"}
          action={
            <ButtonLink href="/dashboard/new-post" tone="primary">
              New post
            </ButtonLink>
          }
        >
          {unread > 0
            ? "This takes a few seconds the first time. The page fills itself when the accounts answer."
            : kind || selectedId
              ? "No posts match this filter. Try another account or post type."
              : "Once these accounts have posts, they appear here — the ones you publish from MarkedFox and the ones you do not."}
        </EmptyState>
      ) : (
        <>
          <MediaGrid items={media.items} accounts={accounts} />
          {media.hasMore ? (
            <div className="flex justify-center">
              <ButtonLink
                href={href({ account: selectedId, kind, page: page + 1 })}
                tone="secondary"
              >
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

function Total({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dd className="font-display order-1 text-[19px] font-bold text-ink">
        {formatCount(value)}
      </dd>
      <dt className="order-2">{label}</dt>
    </div>
  );
}

function ArrowLink({
  href: to,
  direction,
}: {
  href: string;
  direction: "prev" | "next";
}) {
  return (
    <Link
      href={to}
      aria-label={direction === "prev" ? "Previous account" : "Next account"}
      className="flex h-8 w-8 items-center justify-center rounded-full text-[15px] text-faint transition hover:bg-chip hover:text-ink"
    >
      {direction === "prev" ? "‹" : "›"}
    </Link>
  );
}

/** The overlapping avatars. One account when the carousel is on it, the whole
 *  set when it is on "everything". */
function AvatarStack({ accounts }: { accounts: AccountEntry[] }) {
  const shown = accounts.slice(0, 3);
  return (
    <div className="flex items-center -space-x-6">
      {shown.map(({ connection, profile }, index) => (
        <span
          key={connection.id}
          title={profile?.displayName ?? connection.platform_account_name ?? undefined}
          style={{ zIndex: shown.length - index }}
          className="relative inline-flex h-[86px] w-[86px] items-center justify-center overflow-hidden rounded-full border-[3px] border-panel bg-chip"
        >
          {profile?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <PlatformIcon platform={connection.platform} className="h-6 w-6 text-muted" />
          )}
        </span>
      ))}
      {accounts.length > shown.length ? (
        <span className="relative inline-flex h-[86px] w-[86px] items-center justify-center rounded-full border-[3px] border-panel bg-chip text-[15px] font-semibold text-muted">
          +{accounts.length - shown.length}
        </span>
      ) : null}
    </div>
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

  // Columns rather than a grid: posts are portrait, square and text, and a
  // fixed row height would either crop the tall ones or pad the short ones.
  return (
    <div className="columns-2 gap-2 shell:columns-3 wide:columns-4 [&>*]:mb-2">
      {items.map((item) => {
        const metric = metricFor.get(item.connectionId) ?? "views";
        const headline = metric === "views" ? item.views : item.likes;
        return (
          <a
            key={item.id}
            href={item.permalink ?? "#"}
            target={item.permalink ? "_blank" : undefined}
            rel="noreferrer"
            className="group relative block break-inside-avoid overflow-hidden rounded-[10px] bg-chip"
          >
            {item.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.thumbnailUrl}
                alt=""
                loading="lazy"
                className={cx(
                  "w-full object-cover transition duration-300 group-hover:brightness-[1.06]",
                  item.kind === "video" ? "aspect-[9/16]" : "aspect-[4/5]",
                )}
              />
            ) : (
              // A text post has no picture, so it shows its own words — an
              // empty grey tile would read as a broken image.
              <p className="px-3.5 pt-6 pr-10 pb-9 text-[13px]/[19px] text-ink">
                {item.caption?.trim() || "No text"}
              </p>
            )}

            {/* A scrim under the number, because "1,865" in white on a bright
                sky is a number nobody can read. */}
            {item.thumbnailUrl && headline !== null ? (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/55 to-transparent"
              />
            ) : null}

            <span className="absolute top-2 right-2">
              <PlatformBadge
                platform={item.platform}
                className="h-6 w-6 rounded-full"
                title={PLATFORM_LABELS[item.platform]}
              />
            </span>

            {headline !== null ? (
              <span
                className={cx(
                  "absolute bottom-2 left-2 inline-flex items-center gap-1 text-[12px] font-semibold",
                  item.thumbnailUrl
                    ? "text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]"
                    : "text-muted",
                )}
              >
                <span aria-hidden>{metric === "views" ? "▶" : "♥"}</span>
                {formatCount(headline)}
                <span className="sr-only">{metric}</span>
              </span>
            ) : null}
          </a>
        );
      })}
    </div>
  );
}
