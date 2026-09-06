import type { Metadata } from "next";
import Link from "next/link";

import { Icon, type IconName } from "@/components/icons";
import { LocalTime } from "@/components/local-time";
import { PlatformIcon, PlatformTile } from "@/components/platform-icon";
import {
  Button,
  ButtonLink,
  EmptyState,
  Notice,
  Page,
  cx,
  formatCount,
  staggerStyle,
} from "@/components/ui";
import {
  POST_TYPES,
  POST_TYPE_LABELS,
  getProfile,
} from "@/lib/account/preferences";
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
import { AvatarImage } from "@/components/avatar-image";

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
// The grid changes shape with the account, because a person's mental picture
// of their own Instagram is a square grid and their picture of their own X is
// a column of text. Rendering both as the same masonry means neither looks
// like the thing it is a copy of.
//
// Nothing here calls a platform. Everything is read from the cache that
// lib/accounts/sync.ts fills, because these reads are rate-limited per app and,
// on X, billed per request — a page that refreshed on every load would spend
// every user's share of one shared budget on people idly reloading.

const KIND_ICONS: Record<AccountMediaKind, IconName> = {
  video: "play",
  photo: "image",
  text: "drafts",
};

/** Which of the four shapes a single account's posts are laid out in. */
type GridShape = "masonry" | "square" | "vertical" | "timeline";

function shapeFor(platform: Platform | null): GridShape {
  switch (platform) {
    case "instagram":
      return "square";
    case "tiktok":
    case "youtube":
      return "vertical";
    case "threads":
    case "x":
      return "timeline";
    default:
      return "masonry";
  }
}

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
        <h1 className="font-display text-[30px]/[36px] font-bold tracking-[-0.025em]">
          {userRow ? "Account setup incomplete" : "This account no longer exists"}
        </h1>
        <p className="text-[15px]/[24px] text-muted">
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
  const [connections, profiles, preferences] = await Promise.all([
    listConnections(supabase, active.id),
    listAccountProfiles(supabase, active.id),
    getProfile(supabase, user.id).then((row) => row?.preferences ?? null),
  ]);

  // Settings › Platform priority decides which account the arrows reach first.
  // Within a platform the connection order is kept, so somebody with two
  // Instagram accounts still walks them in the order they connected them.
  const platformRank = new Map(
    (preferences?.platformOrder ?? PLATFORMS).map((platform, index) => [
      platform,
      index,
    ]),
  );
  const byConnection = new Map(profiles.map((row) => [row.connectionId, row]));
  const accounts: AccountEntry[] = connections
    .map((connection) => ({
      connection,
      profile: byConnection.get(connection.id) ?? null,
    }))
    .sort(
      (a, b) =>
        (platformRank.get(a.connection.platform) ?? 99) -
        (platformRank.get(b.connection.platform) ?? 99),
    );

  const kinds: { id: AccountMediaKind | null; label: string; icon: IconName }[] = [
    { id: null, label: "All", icon: "grid" },
    ...(preferences?.postTypeOrder ?? POST_TYPES).map((id) => ({
      id,
      label: POST_TYPE_LABELS[id],
      icon: KIND_ICONS[id],
    })),
  ];

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
  const lastSynced = profiles
    .map((row) => row.lastSyncedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  if (connections.length === 0) {
    return (
      <Page>
        <EmptyState
          title="Nothing connected yet"
          action={
            <ButtonLink href="/dashboard/settings/accounts" tone="primary">
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
  const handle =
    current?.profile?.handle ??
    current?.connection.platform_account_name ??
    current?.connection.platform_account_id ??
    null;
  const shape = shapeFor(current?.connection.platform ?? null);

  return (
    <Page>
      {unread > 0 ? <AutoFill /> : null}

      {failed.length > 0 ? (
        <Notice tone="warn">
          {readFailureNotice(failed)}{" "}
          <Link href="/dashboard/settings/accounts" className="underline">
            Manage accounts
          </Link>
        </Notice>
      ) : null}

      {/* ── the profile header ───────────────────────────────────────────── */}
      <header className="flex flex-col items-center gap-6 pt-1 wide:flex-row wide:items-start wide:gap-9">
        <div className="flex items-center gap-2">
          <ArrowLink href={href({ account: previous, kind })} direction="prev" />
          {current ? (
            <SingleAvatar entry={current} />
          ) : (
            <AvatarStack accounts={accounts} />
          )}
          <ArrowLink href={href({ account: next, kind })} direction="next" />
        </div>

        <div className="min-w-0 flex-1 text-center wide:text-left">
          <div className="flex flex-wrap items-center justify-center gap-2.5 wide:justify-start">
            <h1 className="font-display text-[30px]/[36px] font-bold tracking-[-0.025em] text-ink">
              {title}
            </h1>
            <ButtonLink href="/dashboard/drafts" tone="secondary" size="xs">
              Drafts
            </ButtonLink>
            <form action={refreshAccountsAction}>
              <Button type="submit" tone="secondary" size="xs">
                <Icon name="refresh" className="h-3.5 w-3.5" />
                Refresh
              </Button>
            </form>
            {/* There was an "Include X" pill here that re-read the metered
                platforms on demand. Removed by owner decision, 2026-09-06.
                Nothing else changes: the scheduler's sweep still skips metered
                accounts, so X is never read on a schedule, and X's own cached
                figures still show. The only thing gone is the manual press
                that spent money — which is the safe direction to remove a
                control in. `include_metered` stays honoured on the server so
                the capability is one line of UI away if it is ever wanted. */}
          </div>

          <dl className="mt-3.5 flex flex-wrap items-baseline justify-center gap-x-[26px] gap-y-2 text-[13.5px] text-muted wide:justify-start">
            <Total label="posts" value={totals.posts} />
            <Total label="followers" value={totals.followers} />
            <Total label="following" value={totals.following} />
          </dl>

          {current ? (
            <div className="mt-4">
              {handle ? (
                <span className="inline-flex items-center rounded-full bg-chip px-3 py-1 text-[13px] font-semibold text-muted">
                  {handle}
                </span>
              ) : null}
              {current.profile?.bio ? (
                <p className="mt-2.5 max-w-md text-[15px]/[24px] text-pretty text-muted">
                  {current.profile.bio}
                </p>
              ) : null}
              {current.profile?.profileUrl ? (
                <a
                  href={current.profile.profileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-[14px] font-semibold text-accent underline-offset-2 hover:underline"
                >
                  {current.profile.profileUrl.replace(/^https?:\/\//, "")}
                </a>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 text-[13px] text-faint">
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
      {/* Icons only, the way every profile grid does it — the words were
          three times the width of the thing they labelled. The label is not
          lost, it moves to the accessible name and the tooltip, so this is
          still a control that says what it does rather than a bare glyph.
          The lit tab carries a rule under it instead of a filled pill, which
          is what makes a row of icons read as tabs. */}
      <nav
        aria-label="Filter posts by kind"
        className="flex items-stretch justify-center gap-1 border-b border-line"
      >
        {kinds.map((option) => {
          const on = kind === option.id;
          return (
            <Link
              key={option.label}
              href={href({ account: selectedId, kind: option.id })}
              aria-current={on ? "page" : undefined}
              aria-label={option.label}
              title={option.label}
              className={cx(
                "-mb-px inline-flex min-h-[44px] min-w-[64px] items-center justify-center border-b-2 px-5 transition-[color,border-color] duration-110",
                on
                  ? "border-ink text-ink"
                  : "border-transparent text-muted hover:text-ink",
              )}
            >
              <Icon
                name={option.icon}
                className={cx("h-[22px] w-[22px]", on ? "" : "opacity-70")}
                strokeWidth={on ? 2.1 : 1.7}
              />
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
          <MediaGrid
            items={media.items}
            accounts={accounts}
            shape={shape}
            current={current}
          />
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
    // `order` reverses the pair on screen while the markup keeps the definition
    // list's own label-then-value order, which is what a screen reader follows.
    <div className="flex items-baseline gap-2">
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
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-faint transition-[background-color,color] duration-110 hover:bg-chip hover:text-ink"
    >
      <Icon
        name={direction === "prev" ? "chevronLeft" : "chevronRight"}
        className="h-[18px] w-[18px]"
      />
    </Link>
  );
}

function Avatar({
  entry,
  size,
  className,
}: {
  entry: AccountEntry;
  /** Tailwind size classes rather than a number: the stack has to shrink on a
   *  phone, and an inline width cannot answer a media query. */
  size: string;
  className?: string;
}) {
  const { connection, profile } = entry;
  return (
    <span
      className={cx(
        "relative inline-flex items-center justify-center overflow-hidden rounded-full border-[3px] border-panel bg-chip",
        size,
        className,
      )}
    >
      <AvatarImage
        src={profile?.avatarUrl}
        className="h-full w-full object-cover"
        fallback={
          <PlatformIcon
            platform={connection.platform}
            className="h-full w-full"
          />
        }
      />
    </span>
  );
}

/** The overlapping avatars, shown when the carousel is on "everything".
 *
 *  One face in front and the rest tucked behind it, each showing only a sliver
 *  of its edge (owner decision, 2026-09-06). Three faces plus a counter: the
 *  stack is saying "these, and more", not listing anything, so a fourth
 *  overlapped circle adds width without adding meaning.
 *
 *  The overlap is ~78% of the circle, which is what makes it read as a stack
 *  rather than as a row that happens to touch. It also collapses the width:
 *  three 86px circles plus a counter come to 234px instead of 334px, so the
 *  arrows either side now fit a 375px phone with room rather than exactly. */
function AvatarStack({ accounts }: { accounts: AccountEntry[] }) {
  const shown = accounts.slice(0, 3);
  const rest = accounts.length - shown.length;
  const circle = "h-14 w-14 shell:h-[86px] shell:w-[86px]";
  const overlap = "-ml-11 shell:-ml-[67px]";
  return (
    <div className="flex items-center">
      {shown.map((entry, index) => (
        <span
          key={entry.connection.id}
          title={
            entry.profile?.displayName ??
            entry.connection.platform_account_name ??
            undefined
          }
          style={{ zIndex: shown.length - index }}
          className={cx("relative", index > 0 && overlap)}
        >
          <Avatar entry={entry} size={circle} />
        </span>
      ))}
      {rest > 0 ? (
        // z-index 0 so the counter sits at the BACK of the stack. Without it
        // the counter is last in DOM order and paints over the faces, which
        // inverts the whole shape — the front of a stack is a person, and the
        // "+3" is the depth behind them.
        <span
          style={{ zIndex: 0 }}
          className={cx(
            "font-display relative inline-flex items-center justify-center rounded-full border-[3px] border-panel bg-chip text-[15px] font-bold text-muted shell:text-[17px]",
            circle,
            // A lighter overlap than the faces use. At the stack's own -ml-11
            // only 12px of this 56px circle cleared the avatar in front and
            // the number was unreadable — and the count is the one thing in a
            // stack that has to be read, since the faces behind it are already
            // just texture.
            "-ml-5 shell:-ml-8",
          )}
        >
          +{rest}
        </span>
      ) : null}
    </div>
  );
}

/** One account: a bigger avatar with its platform badged on the corner, so a
 *  screen showing a single face still says which network it belongs to. */
function SingleAvatar({ entry }: { entry: AccountEntry }) {
  return (
    <span className="relative inline-block">
      <Avatar entry={entry} size="h-20 w-20 shell:h-[104px] shell:w-[104px]" />
      <span className="absolute right-0 bottom-0">
        <PlatformTile
          platform={entry.connection.platform}
          size={30}
          radius={999}
          className="ring-[3px] ring-panel"
          title={PLATFORM_LABELS[entry.connection.platform]}
        />
      </span>
    </span>
  );
}

function MediaGrid({
  items,
  accounts,
  shape,
  current,
}: {
  items: AccountMediaRow[];
  accounts: AccountEntry[];
  shape: GridShape;
  current: AccountEntry | null;
}) {
  const metricFor = new Map(
    accounts
      .filter((entry) => entry.profile)
      .map((entry) => [entry.connection.id, entry.profile!.primaryMetric]),
  );

  if (shape === "timeline") {
    return <Timeline items={items} account={current} />;
  }

  if (shape === "square" || shape === "vertical") {
    // The platform's own grid, at its own aspect ratio and its own 3px gutter.
    // Anyone who has looked at their profile on the phone recognises this
    // instantly, which is the entire argument for not using one layout.
    return (
      <div className="grid grid-cols-3 gap-[3px]">
        {items.map((item, i) => (
          <a
            key={item.id}
            href={item.permalink ?? "#"}
            target={item.permalink ? "_blank" : undefined}
            rel="noreferrer"
            // The stagger runs once, on the first paint of the grid, and only
            // over the first handful of tiles — see `staggerStyle`. Past that
            // it stops being a grid arriving and starts being a grid the user
            // is waiting for.
            style={staggerStyle(i)}
            className={cx(
              "mf-enter group relative block overflow-hidden bg-chip",
              shape === "square" ? "aspect-square" : "aspect-[9/16]",
            )}
          >
            {item.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.thumbnailUrl}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover transition-[filter] duration-110 group-hover:brightness-[1.06]"
              />
            ) : (
              <p className="p-3 text-[13px]/[19px] text-ink">
                {item.caption?.trim() || "No text"}
              </p>
            )}
            {shape === "vertical" && item.views !== null ? (
              <>
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/55 to-transparent"
                />
                <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 text-[12.5px] font-bold text-white drop-shadow-e1">
                  <Icon name="play" className="h-3.5 w-3.5" />
                  {formatCount(item.views)}
                  <span className="sr-only">views</span>
                </span>
              </>
            ) : null}
          </a>
        ))}
      </div>
    );
  }

  // Columns rather than a grid: across every account at once the posts are
  // portrait, square and text, and a fixed row height would either crop the
  // tall ones or pad the short ones.
  return (
    <div className="columns-2 gap-2.5 shell:columns-3 wide:columns-4 [&>*]:mb-2.5">
      {items.map((item, i) => {
        const metric = metricFor.get(item.connectionId) ?? "views";
        const headline = metric === "views" ? item.views : item.likes;
        return (
          <a
            key={item.id}
            href={item.permalink ?? "#"}
            target={item.permalink ? "_blank" : undefined}
            rel="noreferrer"
            style={staggerStyle(i)}
            className="mf-enter group relative block break-inside-avoid overflow-hidden rounded-lg bg-chip"
          >
            {item.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.thumbnailUrl}
                alt=""
                loading="lazy"
                className={cx(
                  "w-full object-cover transition-[filter] duration-110 group-hover:brightness-[1.06]",
                  item.kind === "video" ? "aspect-[9/16]" : "aspect-[4/5]",
                )}
              />
            ) : (
              // A text post has no picture, so it shows its own words — an
              // empty grey tile would read as a broken image.
              <p className="px-4 pt-6 pr-10 pb-10 text-[14px]/[21px] text-pretty text-ink">
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
              <PlatformTile
                platform={item.platform}
                size={24}
                title={PLATFORM_LABELS[item.platform]}
              />
            </span>

            {headline !== null ? (
              <span
                className={cx(
                  "absolute bottom-2 left-2 inline-flex items-center gap-1 text-[12.5px] font-bold",
                  item.thumbnailUrl
                    ? "text-white drop-shadow-e1"
                    : "text-muted",
                )}
              >
                <Icon
                  name={metric === "views" ? "play" : "spark"}
                  className="h-3.5 w-3.5"
                />
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

/** Threads and X: a column of posts rather than a grid of pictures, because
 *  that is what a post on either of them is. */
function Timeline({
  items,
  account,
}: {
  items: AccountMediaRow[];
  account: AccountEntry | null;
}) {
  const name =
    account?.profile?.displayName ??
    account?.connection.platform_account_name ??
    "";
  const handle = account?.profile?.handle ?? "";

  return (
    <div className="mx-auto flex w-full max-w-[36rem] flex-col">
      {items.map((item) => (
        <article
          key={item.id}
          className="flex gap-3 border-b border-line py-4 last:border-b-0"
        >
          {account ? (
            <Avatar entry={account} size="h-10 w-10" className="border-0" />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-baseline gap-x-1.5 text-[14px]">
              <span className="font-semibold text-ink">{name}</span>
              <span className="text-[13px] text-faint">{handle}</span>
              {item.postedAt ? (
                <span className="text-[13px] text-faint">
                  · <LocalTime value={item.postedAt} fallback="" />
                </span>
              ) : null}
            </p>
            {item.caption ? (
              <p className="mt-1.5 text-[14.5px]/[22px] text-pretty whitespace-pre-wrap text-ink">
                {item.caption}
              </p>
            ) : null}
            {item.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.thumbnailUrl}
                alt=""
                loading="lazy"
                className="mt-3 w-full rounded-lg border border-line object-cover"
              />
            ) : null}
            <p className="mt-2.5 flex items-center gap-5 text-[13px] text-faint">
              <span className="inline-flex items-center gap-1.5">
                <Icon name="chat" className="h-4 w-4" />
                {formatCount(item.comments ?? 0)}
                <span className="sr-only">replies</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="spark" className="h-4 w-4" />
                {formatCount(item.likes ?? 0)}
                <span className="sr-only">likes</span>
              </span>
              {item.permalink ? (
                <a
                  href={item.permalink}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto inline-flex items-center gap-1.5 hover:text-ink"
                >
                  <Icon name="external" className="h-4 w-4" />
                  <span className="sr-only">Open the post</span>
                </a>
              ) : null}
            </p>
          </div>
        </article>
      ))}
    </div>
  );
}
