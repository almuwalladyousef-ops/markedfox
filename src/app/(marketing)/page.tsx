import type { Metadata } from "next";

import Link from "next/link";
import type { ReactNode } from "react";

import { Icon, type IconName } from "@/components/icons";
import { PlatformTile } from "@/components/platform-icon";
import { buttonClass, cx, FoxMark, staggerStyle } from "@/components/ui";
import type { Platform } from "@/lib/platforms/types";

import { AutomationDemo } from "./_components/home/automation-demo";
import { Faq } from "./_components/home/faq";
import {
  AccountRow,
  Avatar,
  Chip,
  Frame,
  MockStat,
  MockStatRow,
  OutlierPill,
  PlatformPick,
  PostTile,
  SettingRow,
} from "./_components/home/mocks";
import { BillingIntervalProvider } from "./_components/billing-interval";
import { StackCalculator } from "./_components/home/stack-calculator";
import { PLANS } from "./_components/plans-data";
import { PlanGrid } from "./pricing/plan-grid";

export const metadata: Metadata = {
  title: "MarkedFox — publish everywhere, answer everyone, know what works",
  description:
    "One composer for Instagram, TikTok, YouTube, X, Facebook, Threads and Snapchat; comment-to-DM automation that answers while you sleep; research that shows which videos beat their own channel's average. One tool instead of three.",
};

// The public landing page. Static and env-free by design — it imports
// nothing from src/lib except types, so it prerenders with zero environment
// variables set.
//
// The story runs in the order a creator's week runs: find what works, post it
// everywhere, let the comments sell, then read the numbers and manage all of
// it from one place. Each section is built from the product's own shapes (see
// _components/home/mocks.tsx) rather than from screenshots, and every claim
// on the page is one the app can keep today — where a platform gates a
// capability behind its own review, the page says so rather than rounding up.

const PLATFORM_ROW: { platform: Platform; label: string }[] = [
  { platform: "instagram", label: "Instagram" },
  { platform: "tiktok", label: "TikTok" },
  { platform: "youtube", label: "YouTube" },
  { platform: "facebook", label: "Facebook" },
  { platform: "threads", label: "Threads" },
  { platform: "x", label: "X" },
  { platform: "snapchat", label: "Snapchat" },
];

// ── small layout helpers ───────────────────────────────────────────────────

function Container({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("mx-auto w-full max-w-[1120px] px-6", className)}>
      {children}
    </div>
  );
}

/** A section's opening: the heading, then the one paragraph that earns it.
 *  No label above the heading — the heading carries its own weight. */
function Opening({
  title,
  lede,
  align = "left",
  className,
}: {
  title: ReactNode;
  lede?: ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div
      className={cx(
        "max-w-[720px]",
        align === "center" && "mx-auto text-center",
        className,
      )}
    >
      <h2 className="font-display text-[32px]/[38px] font-bold tracking-[-0.03em] text-ink text-balance shell:text-[44px]/[50px]">
        {title}
      </h2>
      {lede ? (
        <p className="mt-5 text-[17px]/[27px] text-muted text-pretty">{lede}</p>
      ) : null}
    </div>
  );
}

function Check({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-3 text-[15.5px]/[24px] text-muted">
      <span className="mt-[6px] inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center text-accent">
        <Icon name="check" className="h-3.5 w-3.5" strokeWidth={2.4} />
      </span>
      <span className="text-pretty">{children}</span>
    </li>
  );
}

function Fact({
  icon,
  title,
  children,
}: {
  icon: IconName;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
        <Icon name={icon} className="h-[18px] w-[18px]" />
      </span>
      <div>
        <h3 className="text-[16px] font-semibold text-ink">{title}</h3>
        <p className="mt-1 text-[14.5px]/[22px] text-muted text-pretty">{children}</p>
      </div>
    </div>
  );
}

// ── the page ───────────────────────────────────────────────────────────────

export default function Home() {
  return (
    <main>
      <Hero />
      <Ticker />
      <HowItWorks />
      <Automate />
      <Research />
      <Publish />
      <Own />
      <Compare />
      {/* Both of these ask "monthly or yearly?" and they are the same
          question, so they share one answer. Wrapped together rather than
          each holding its own state: they had different defaults, so the
          page contradicted itself on load and setting one did nothing to
          the other. */}
      <BillingIntervalProvider>
        <Stack />
        <Plans />
      </BillingIntervalProvider>
      <Questions />
      <Closer />
    </main>
  );
}

// ── hero ───────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="overflow-hidden">
      <Container className="grid grid-cols-[minmax(0,1fr)] items-center gap-12 pt-14 pb-16 wide:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] wide:pt-24 wide:pb-24">
        <div>
          <h1 className="font-display text-[42px]/[46px] font-bold tracking-[-0.035em] text-ink text-balance shell:text-[52px]/[56px] xl:text-[60px]/[62px]">
            Publish everywhere.
            <br />
            Answer everyone.
            <br />
            <span className="text-accent">Know what works.</span>
          </h1>
          <p className="mt-6 max-w-[500px] text-[17px]/[26px] text-muted text-pretty shell:text-[18px]/[28px]">
            Post to seven platforms at once. Answer every comment and DM while
            you sleep. See which videos beat their own channel’s average. One
            tool, not three.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/signup" className={buttonClass("primary", "lg")}>
              Start free — no card
            </Link>
            <a href="#how" className={buttonClass("secondary", "lg")}>
              See how it works
            </a>
          </div>
          <ul className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-3">
            {PLATFORM_ROW.map(({ platform, label }) => (
              <li
                key={platform}
                className="flex items-center gap-2 text-[13px] font-medium text-faint"
              >
                <PlatformTile platform={platform} size={22} />
                {label}
              </li>
            ))}
          </ul>
        </div>

        <HeroScene />
      </Container>
    </section>
  );
}

/** One piece of the product, at full size: the composer on step three, with
 *  three accounts selected and four platforms picked. It used to be three
 *  frames — composer, phone and outlier card — overlapping in a 600px box,
 *  and they competed: no single thing for the eye to land on beside a
 *  headline that is itself three lines. The other two pillars each own a
 *  whole section further down, so the hero no longer has to carry all three. */
function HeroScene() {
  return (
    <div className="mx-auto w-full max-w-[460px] wide:mx-0 wide:ml-auto">
      <Frame
        title="New post"
        aside="Step 3 of 5 · Caption and platforms"
        className="mf-enter w-full"
        style={staggerStyle(0, 70, 1)}
      >
        <div className="flex items-center gap-2">
          <span className="flex -space-x-2">
            <Avatar name="maya.kim" size={32} hue={0} className="ring-2 ring-[var(--mk-panel)]" />
            <Avatar name="maya on tiktok" size={32} hue={1} className="ring-2 ring-[var(--mk-panel)]" />
            <Avatar name="Maya Kim Studio" size={32} hue={3} className="ring-2 ring-[var(--mk-panel)]" />
          </span>
          <span className="text-[12.5px] text-[var(--mk-muted)]">3 accounts · Reel</span>
        </div>
        <p className="mt-5 text-[16px]/[24px] text-[var(--mk-text)]">
          Three things I wish I knew before my first 100k views 👇
        </p>
        <p className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-[var(--mk-faint)] tabular-nums">
          <span>Instagram 58/2,200</span>
          <span>TikTok 58/2,200</span>
          <span>YouTube 58/5,000</span>
          <span>Threads 58/500</span>
        </p>
        <p className="mt-5 text-[12px] font-semibold text-[var(--mk-muted)]">
          Choose platforms
        </p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-3">
          <PlatformPick platform="instagram" label="Reel" />
          <PlatformPick platform="tiktok" label="TikTok" />
          <PlatformPick platform="youtube" label="Short" />
          <PlatformPick platform="threads" label="Thread" />
          <PlatformPick platform="facebook" label="Reel" selected={false} />
        </div>
        <div className="mt-5 flex items-center justify-between gap-3 border-t border-[var(--mk-line)] pt-4">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-soft px-2.5 py-1 text-[11.5px] font-semibold text-sky">
            <Icon name="calendar" className="h-3 w-3" />
            Fri 9:00 AM
          </span>
          <span className="rounded-md bg-[var(--mk-text)] px-4 py-2 text-[13px] font-semibold text-[var(--mk-bg)]">
            Next
          </span>
        </div>
      </Frame>
    </div>
  );
}

// ── ticker ─────────────────────────────────────────────────────────────────

/** A thin band of facts under the hero. Both reference products run one, and
 *  theirs carry a promotion; this one carries only things the app can keep.
 *  The track holds the same list twice and slides by exactly half, so the
 *  loop has no seam. `aria-hidden` on the copy, because a screen reader
 *  should hear the list once. */
const TICKER_FACTS = [
  "Seven platforms, one composer",
  "A comment becomes a DM in seconds",
  "Videos scored against their own channel’s median",
  "One workspace per brand or client",
  "X capped at 300 posts a month",
  "Free plan, no card, no trial clock",
];

function TickerRun({ hidden }: { hidden?: boolean }) {
  return (
    <ul
      aria-hidden={hidden || undefined}
      className="flex shrink-0 items-center gap-8 pr-8"
    >
      {TICKER_FACTS.map((fact) => (
        <li
          key={fact}
          className="flex shrink-0 items-center gap-8 text-[13.5px] font-medium whitespace-nowrap text-muted"
        >
          {fact}
          <span className="h-1 w-1 shrink-0 rounded-full bg-accent" />
        </li>
      ))}
    </ul>
  );
}

function Ticker() {
  return (
    <div className="mf-band overflow-hidden border-y border-line py-3.5">
      <div className="mf-ticker flex w-max">
        <TickerRun />
        <TickerRun hidden />
      </div>
    </div>
  );
}

// ── how it works ───────────────────────────────────────────────────────────

function HowItWorks() {
  return (
    <section id="how">
      <Container className="py-20 shell:py-28">
        <Opening
          title="How it works"
          lede="Four steps, in the order a week actually goes. Nothing here needs a manual."
        />
        <ol className="mt-4 divide-y divide-line">
          <Step
            n={1}
            title="Connect your accounts"
            body="Sign in with each platform’s own login. Several accounts per platform, one workspace per brand, and the toggle on each account says exactly what it can do today."
            visual={
              <Frame title="Connected accounts" aside="Workspace · Maya Kim" pad={false} className="w-full max-w-[440px]">
                <div className="divide-y divide-[var(--mk-line)] px-4">
                  <AccountRow platform="instagram" handle="@maya.kim" note="Reels, photos, carousels · comments & DMs" />
                  <AccountRow platform="tiktok" handle="@mayakim" note="Direct post · privacy set per video" />
                  <AccountRow platform="youtube" handle="Maya Kim" note="Shorts and long video up to 256GB" />
                  <AccountRow platform="threads" handle="@maya.kim" note="Text, photos, video" />
                  <AccountRow platform="x" handle="@mayakim" note="300 a month · no external links" on={false} />
                </div>
                <div className="border-t border-[var(--mk-line)] px-4 py-3 text-[12px] font-semibold text-accent">
                  + Connect another account
                </div>
              </Frame>
            }
          />
          <Step
            n={2}
            title="Find what already works"
            body="Watch a channel. Every video is scored against that channel’s own recent median, so a small channel’s breakout ranks above a big channel’s ordinary day. The winners get a breakdown of why."
            visual={<FeedMock compact />}
          />
          <Step
            n={3}
            title="Post once, everywhere"
            body="One video, one caption, every platform’s own settings — visibility on YouTube, privacy and disclosure on TikTok, who can reply on X and Threads. Limits are checked while you type, never after you press publish."
            visual={<SettingsMock />}
          />
          <Step
            n={4}
            title="Let the comments do the selling"
            body="A rule is one sentence: when someone comments this word, send that DM. It runs in seconds, once per person, with every click counted on the rule that earned it."
            visual={<RuleMock />}
          />
        </ol>
      </Container>
    </section>
  );
}

function Step({
  n,
  title,
  body,
  visual,
}: {
  n: number;
  title: string;
  body: string;
  visual: ReactNode;
}) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)] items-center gap-8 py-12 wide:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] wide:gap-16 wide:py-16">
      <div>
        <p className="font-display text-[15px] font-bold tracking-[0.02em] text-accent tabular-nums">
          Step {n}
        </p>
        <h3 className="font-display mt-2 text-[26px]/[32px] font-bold tracking-[-0.025em] text-ink text-balance shell:text-[32px]/[38px]">
          {title}
        </h3>
        <p className="mt-4 max-w-[52ch] text-[16px]/[25px] text-muted text-pretty">{body}</p>
      </div>
      <div className="flex justify-center wide:justify-end">{visual}</div>
    </li>
  );
}

function FeedMock({ compact }: { compact?: boolean }) {
  const videos: {
    platform: Platform;
    handle: string;
    title: string;
    multiple: string;
    tier: "validated" | "outlier" | "strong" | "normal";
    views: string;
    hue: number;
  }[] = [
    { platform: "youtube", handle: "@smallkitchen", title: "I stopped posting every day. Here’s what my views did.", multiple: "14.2x", tier: "validated", views: "312K", hue: 0 },
    { platform: "instagram", handle: "@ren.builds", title: "The desk that made me stop working from bed", multiple: "3.8x", tier: "outlier", views: "48K likes", hue: 1 },
    { platform: "youtube", handle: "@fieldnotes", title: "Nobody tells you this about your first client", multiple: "2.4x", tier: "outlier", views: "1.1M", hue: 2 },
    { platform: "tiktok", handle: "@mayakim", title: "Stop editing like this", multiple: "1.1x", tier: "normal", views: "188K", hue: 3 },
  ];
  const shown = compact ? videos.slice(0, 3) : videos;
  return (
    <Frame title="Research" aside="Sorted by multiple" className={cx("w-full", compact ? "max-w-[520px]" : "")}>
      <div className="mf-noscroll -mx-4 flex gap-2 overflow-x-auto px-4">
        <Chip active icon="filter">Above 2x</Chip>
        <Chip>Last 3 months</Chip>
        <Chip>YouTube · Instagram · TikTok</Chip>
        <Chip>Not yet analyzed</Chip>
      </div>
      <div className={cx("mt-4 grid gap-3", compact ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-4")}>
        {shown.map((video, index) => (
          <div
            key={video.title}
            className={cx("flex min-w-0 flex-col", compact && index === 2 && "hidden sm:flex")}
          >
            <PostTile platform={video.platform} caption={video.title} metric={video.views} hue={video.hue} aspect={compact ? "aspect-[9/16]" : "aspect-[4/5]"} />
            <div className="mt-2 flex flex-col gap-1.5">
              <OutlierPill multiple={video.multiple} tier={video.tier} />
              <p className="truncate text-[11px] text-[var(--mk-faint)]">{video.handle}</p>
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function SettingsMock() {
  return (
    <Frame title="New post" aside="Step 4 of 5 · Settings" className="w-full max-w-[520px]">
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <div>
          <p className="flex items-center gap-2 text-[12.5px] font-semibold text-[var(--mk-text)]">
            <PlatformTile platform="youtube" size={20} />
            Share on YouTube
          </p>
          <div className="mt-1 divide-y divide-[var(--mk-line)]">
            <SettingRow label="Visibility" value="Public" />
            <SettingRow label="Add #shorts to the title" toggle />
            <SettingRow label="Audience" value="Not made for kids" />
          </div>
        </div>
        <div>
          <p className="flex items-center gap-2 text-[12.5px] font-semibold text-[var(--mk-text)]">
            <PlatformTile platform="tiktok" size={20} />
            Share on TikTok
          </p>
          <div className="mt-1 divide-y divide-[var(--mk-line)]">
            <SettingRow label="Who can view" value="Everyone" />
            <SettingRow label="Allow comments" toggle />
            <SettingRow label="Disclose commercial content" toggle={false} />
          </div>
        </div>
        <div>
          <p className="flex items-center gap-2 text-[12.5px] font-semibold text-[var(--mk-text)]">
            <PlatformTile platform="instagram" size={20} />
            Share on Instagram
          </p>
          <div className="mt-1 divide-y divide-[var(--mk-line)]">
            <SettingRow label="Profile display" value="Main grid and Reels" />
            <SettingRow label="Allow comments" toggle />
          </div>
        </div>
        <div>
          <p className="flex items-center gap-2 text-[12.5px] font-semibold text-[var(--mk-text)]">
            <PlatformTile platform="threads" size={20} />
            Share on Threads
          </p>
          <div className="mt-1 divide-y divide-[var(--mk-line)]">
            <SettingRow label="Who can reply" value="Anyone" />
            <SettingRow label="Caption" value="58 / 500" />
          </div>
        </div>
      </div>
    </Frame>
  );
}

function RuleMock() {
  return (
    <Frame title="Auto-DM a link from comments" aside="Live" className="w-full max-w-[520px]">
      <p className="text-[15px]/[26px] text-[var(--mk-muted)]">
        When someone comments{" "}
        <Word>link</Word> or <Word>guide</Word> on{" "}
        <Word>this reel</Word>, send them{" "}
        <Word>“Tap below and I’ll send the link straight over”</Word> with a
        button to <Word>markedfox.com/guide</Word>, and reply publicly{" "}
        <Word>“Just sent it to your DMs 📩”</Word>. Once per person.
      </p>
      <div className="mt-4 border-t border-[var(--mk-line)] pt-4">
        <MockStatRow>
          <MockStat label="Runs" value="2,410" />
          <MockStat label="Sends" value="2,388" />
          <MockStat label="Clicks" value="917" accent />
          <MockStat label="CTR" value="38%" />
        </MockStatRow>
      </div>
    </Frame>
  );
}

function Word({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-md bg-[var(--mk-chip)] px-1.5 py-[2px] text-[13.5px] font-semibold text-[var(--mk-text)]">
      {children}
    </span>
  );
}

// ── automation ─────────────────────────────────────────────────────────────

function Automate() {
  return (
    <section id="automate" className="mf-band border-t border-line">
      <Container className="py-20 shell:py-28">
        <Opening
          title="Turn comments into conversations that convert."
          lede="Pick what the rule should do, and watch what lands on the other person’s phone. These are the app’s own templates, word for word."
        />
        <div className="mt-12">
          <AutomationDemo />
        </div>

        <div className="mt-16 grid gap-x-12 gap-y-8 border-t border-line pt-12 sm:grid-cols-2 wide:grid-cols-3">
          <Fact icon="chat" title="Comment to DM">
            Someone comments a keyword on a post or reel and gets a DM — plus a
            public reply, so everyone else sees it worked.
          </Fact>
          <Fact icon="search" title="Keyword DMs">
            A word in a DM answers itself: price, hours, shipping. Every time,
            or once per person — your call.
          </Fact>
          <Fact icon="play" title="Story replies">
            Reply to a story with a word and the rule answers, with a link if
            you want one.
          </Fact>
          <Fact icon="refresh" title="Follow-ups that skip the converted">
            A nudge after a delay, sent only to people who wrote back and never
            tapped. Nobody who already clicked gets chased.
          </Fact>
          <Fact icon="mail" title="Email capture">
            Ask for the email inside the DM. The address stays on the contact
            and counts on the rule.
          </Fact>
          <Fact icon="link" title="Every button is tracked">
            Clicks land on the rule that earned them, so Runs, Sends, Clicks
            and CTR are real numbers, not estimates.
          </Fact>
        </div>
      </Container>
    </section>
  );
}

// ── research ───────────────────────────────────────────────────────────────

function Research() {
  return (
    <section id="research">
      <Container className="py-20 shell:py-28">
        <Opening
          title="Find what already worked. Then make yours."
          lede="Watch any channel. MarkedFox scores every video against that channel’s own recent median, breaks down why the winners won, and writes from the mechanism — never from the wording."
        />

        <div className="mt-12">
          <FeedMock />
        </div>

        <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-4 wide:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <Frame title="Breakdown" aside="@smallkitchen · 14.2x">
            <p className="text-[11.5px] font-semibold text-[var(--mk-faint)]">Hook, quoted</p>
            <p className="font-display mt-1 text-[19px]/[26px] font-bold tracking-[-0.02em] text-[var(--mk-text)] text-pretty">
              “I posted every day for a year and my channel got smaller. Then
              I did the opposite.”
            </p>
            <div className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <div>
                <p className="text-[11.5px] font-semibold text-[var(--mk-faint)]">Pattern</p>
                <p className="mt-1 text-[13.5px]/[19px] text-[var(--mk-text)]">
                  Contradiction — says the opposite of what the viewer expects
                </p>
              </div>
              <div>
                <p className="text-[11.5px] font-semibold text-[var(--mk-faint)]">Curiosity loop</p>
                <p className="mt-1 text-[13.5px]/[19px] text-[var(--mk-text)]">
                  Opened at 0:02, paid off at 1:48 — the numbers are held back
                  until the last beat
                </p>
              </div>
              <div>
                <p className="text-[11.5px] font-semibold text-[var(--mk-faint)]">The idea</p>
                <p className="mt-1 text-[13.5px]/[19px] text-[var(--mk-text)]">
                  Overturns “consistency wins” — the belief the audience
                  already holds
                </p>
              </div>
              <div>
                <p className="text-[11.5px] font-semibold text-[var(--mk-faint)]">The execution</p>
                <p className="mt-1 text-[13.5px]/[19px] text-[var(--mk-text)]">
                  Talking head, three on-screen numbers, one chart, a
                  takeaway said twice
                </p>
              </div>
            </div>
          </Frame>

          <Frame title="Script" aside="Stage 3 of 5">
            <ol className="flex flex-wrap gap-1.5">
              {["Topic", "Research", "Hook", "Style", "Script"].map((stage, index) => (
                <li
                  key={stage}
                  className={cx(
                    "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                    index < 2
                      ? "bg-ok-soft text-ok"
                      : index === 2
                        ? "bg-accent text-accent-ink"
                        : "bg-[var(--mk-chip)] text-[var(--mk-faint)]",
                  )}
                >
                  {stage}
                </li>
              ))}
            </ol>
            <p className="mt-4 text-[11.5px] font-semibold text-[var(--mk-faint)]">
              Three hooks, written from the breakdown
            </p>
            <ul className="mt-2 divide-y divide-[var(--mk-line)]">
              {[
                "I doubled my views by posting a third as often.",
                "The advice that shrank my channel came from the biggest creators I know.",
                "Nobody warns you what daily posting does to the videos you actually care about.",
              ].map((hook, index) => (
                <li key={hook} className="flex items-start gap-2.5 py-2.5 text-[13.5px]/[19px] text-[var(--mk-text)]">
                  <span className="mt-[3px] inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--mk-chip)] text-[10px] font-bold text-[var(--mk-muted)] tabular-nums">
                    {index + 1}
                  </span>
                  <span className="text-pretty">{hook}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-[var(--mk-faint)]">
              <Icon name="hooks" className="h-3 w-3" />
              Saved to your hook vault · 1 credit, charged after the model answered
            </p>
          </Frame>
        </div>

        <div className="mt-12 grid gap-x-12 gap-y-8 border-t border-line pt-12 sm:grid-cols-2 wide:grid-cols-4">
          <Fact icon="chart" title="Median, not mean">
            One viral video would drag an average up and hide the next winner.
            The baseline is the channel’s median over its last twenty videos.
          </Fact>
          <Fact icon="calendar" title="48 hours before it counts">
            A video is scored only once it has had two days to find its
            audience. Thin data shows a dash, never a confident wrong number.
          </Fact>
          <Fact icon="channels" title="Reads what it can, says what it can’t">
            Any public YouTube channel. Any public Instagram business account.
            TikTok reads only your own connected account — its research API is
            academic-only — and the app says so.
          </Fact>
          <Fact icon="autoanalyze" title="Auto-analyze rules">
            Set a threshold on a channel and every new outlier gets its
            breakdown without you opening the feed.
          </Fact>
        </div>
      </Container>
    </section>
  );
}

// ── publisher ──────────────────────────────────────────────────────────────

function Publish() {
  return (
    <section id="publish" className="mf-band border-t border-line">
      <Container className="py-20 shell:py-28">
        <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-12 wide:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] wide:gap-16">
          <div>
            <Opening
              title="Write once. Post everywhere, each its own way."
              lede="A Reel on Instagram, a Short on YouTube, a Thread on Threads — one upload, one caption, and every platform’s own settings, limits and word for the post."
            />
            <ul className="mt-8 flex flex-col gap-3">
              <Check>
                Caption limits and media rules checked while you type — Instagram’s 2,200, Threads’ 500, X’s 280 — never as an error after
              </Check>
              <Check>
                Schedule to any date on the calendar, or post now; drafts keep anything unfinished
              </Check>
              <Check>
                Trim and volume in the browser. The video stream is never re-encoded, so an untouched clip uploads byte for byte
              </Check>
              <Check>
                Short videos up to 1GB, long videos up to 256GB — YouTube’s own ceiling — uploaded straight from your browser to storage
              </Check>
              <Check>
                If one platform fails, the others still go out, and the post says which one failed and why
              </Check>
            </ul>
            <p className="mt-6 max-w-[520px] text-[14px]/[22px] text-faint text-pretty">
              Instagram, Facebook and Threads are open now. TikTok, YouTube, X
              and Snapchat are wired and switch on inside the app as each
              platform’s own review clears — the toggle on the account tells
              you where it stands. LinkedIn and Pinterest follow after launch.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <Frame title="New post" aside="Step 2 of 5 · Video">
              <div className="flex gap-4">
                <div className="flex aspect-[9/16] w-[118px] shrink-0 flex-col justify-end rounded-lg p-2.5" style={{ background: "linear-gradient(170deg,#2a1a12 0%,#141416 70%)" }}>
                  <p className="text-[11px]/[14px] font-semibold text-[var(--mk-text)]">first-100k.mp4</p>
                  <p className="text-[10px] text-[var(--mk-muted)] tabular-nums">0:42 · 212MB</p>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-[var(--mk-chip)] px-2.5 py-1.5 text-[11.5px] font-semibold text-[var(--mk-text)]">Trim</span>
                    <span className="rounded-md bg-[var(--mk-chip)] px-2.5 py-1.5 text-[11.5px] font-semibold text-[var(--mk-text)]">Audio</span>
                  </div>
                  <div className="mt-3 h-[6px] overflow-hidden rounded-full bg-[var(--mk-chip)]">
                    <div className="ml-[8%] h-full w-[74%] rounded-full bg-accent" />
                  </div>
                  <p className="mt-2 text-[11px] text-[var(--mk-faint)] tabular-nums">
                    0:03 → 0:34 · cut on the nearest keyframe · −3.0 dB
                  </p>
                  <div className="mt-4 divide-y divide-[var(--mk-line)]">
                    <SettingRow label="Kind" value="Short video" />
                    <SettingRow label="Upload" value="Straight to storage" />
                  </div>
                </div>
              </div>
            </Frame>
            <Frame title="Calendar" aside="Week of Oct 5" pad={false}>
              <div className="grid grid-cols-7 divide-x divide-[var(--mk-line)]">
                {[
                  { d: "Mon", n: "5", posts: [["instagram", "youtube"], []] },
                  { d: "Tue", n: "6", posts: [["tiktok"], []] },
                  { d: "Wed", n: "7", posts: [["instagram", "tiktok", "youtube", "threads"], []] },
                  { d: "Thu", n: "8", posts: [[], []] },
                  { d: "Fri", n: "9", posts: [["instagram", "facebook"], ["x"]] },
                  { d: "Sat", n: "10", posts: [["youtube"], []] },
                  { d: "Sun", n: "11", posts: [[], []] },
                ].map((day) => (
                  <div key={day.d} className="min-h-[92px] px-1.5 py-2">
                    <p className="text-center text-[10px] text-[var(--mk-faint)]">
                      {day.d} <span className="text-[var(--mk-text)] tabular-nums">{day.n}</span>
                    </p>
                    <div className="mt-2 flex flex-col gap-1">
                      {day.posts
                        .filter((group) => group.length > 0)
                        .map((group, index) => (
                          <span key={index} className="flex justify-center -space-x-1 rounded-md bg-[var(--mk-chip)] py-1">
                            {group.map((platform) => (
                              <PlatformTile key={platform} platform={platform as Platform} size={14} radius={999} />
                            ))}
                          </span>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </Frame>
          </div>
        </div>
      </Container>
    </section>
  );
}

// ── ownership and analytics ────────────────────────────────────────────────

function Own() {
  return (
    <section id="own">
      <Container className="py-20 shell:py-28">
        <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-12 wide:grid-cols-2 wide:gap-16">
          <div className="order-2 flex justify-center wide:order-1">
            <div className="flex w-full max-w-[460px] flex-col gap-4">
              <Frame title="Home" aside="All accounts · Refresh">
                <MockStatRow>
                  <MockStat label="Posts" value="412" />
                  <MockStat label="Followers" value="128K" />
                  <MockStat label="Following" value="310" />
                </MockStatRow>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <PostTile platform="tiktok" hue={1} caption="Stop editing like this" metric="188K" aspect="aspect-square" />
                  <PostTile platform="youtube" hue={2} caption="I posted daily for 30 days" metric="92.5K" aspect="aspect-square" />
                  <PostTile platform="instagram" hue={0} caption="Three things I wish I knew" metric="41.2K likes" aspect="aspect-square" />
                </div>
              </Frame>
              <Frame title="Contacts" aside="From DM rules">
                <ul className="divide-y divide-[var(--mk-line)]">
                  {[
                    ["sam.reyes", "sam.reyes@example.com", "Shipping & prices"],
                    ["jordan.p", "jordan@example.com", "Freebie for an email"],
                    ["lee.ortiz", "—", "Auto-DM a link"],
                  ].map(([name, email, rule], index) => (
                    <li key={name} className="flex items-center gap-3 py-2.5">
                      <Avatar name={name} size={26} hue={index + 1} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-semibold text-[var(--mk-text)]">@{name}</p>
                        <p className="truncate text-[11px] text-[var(--mk-faint)]">{email}</p>
                      </div>
                      <span className="hidden truncate text-[11px] text-[var(--mk-muted)] sm:inline">{rule}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--mk-line)] pt-3">
                  <span className="text-[11.5px] text-[var(--mk-faint)]">Everything that is yours, as one file</span>
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--mk-chip)] px-2.5 py-1.5 text-[11.5px] font-semibold text-[var(--mk-text)]">
                    <Icon name="export" className="h-3 w-3" />
                    Export
                  </span>
                </div>
              </Frame>
            </div>
          </div>

          <div className="order-1 wide:order-2">
            <Opening
              title="Your numbers. Your list. Your account."
              lede="Every follower count, every post’s views or likes, every click and every email a rule collected — on your account, refreshed when you ask, and exportable as one file."
            />
            <ul className="mt-8 flex flex-col gap-3">
              <Check>
                Home shows every connected account the way its own platform shows it — followers, posts, and the number that platform actually publishes, views or likes, labelled honestly
              </Check>
              <Check>
                Runs, sends, clicks, CTR and emails on every rule, and usage against your plan on every meter
              </Check>
              <Check>
                Emails collected in DMs stay on the contact, on your account — not in a chat window you cannot leave
              </Check>
              <Check>
                Export everything as one file. Delete everything, including the encrypted platform tokens, with one control in Settings
              </Check>
            </ul>
          </div>
        </div>
      </Container>
    </section>
  );
}

// ── the three tools, side by side ──────────────────────────────────────────

/** The stack most people run, as a table.
 *
 *  The columns are categories, not brand names, and each row is marked only
 *  where the category does that job by definition — a posting tool does not
 *  answer DMs and a DM tool does not post. Naming a product and then listing
 *  what it cannot do would be a claim about somebody else's roadmap, which
 *  this page has no way to keep true. */
function Compare() {
  const columns = [
    "MarkedFox",
    "A posting tool",
    "A DM tool",
    "A research tool",
  ];
  const rows: { label: string; has: boolean[] }[] = [
    { label: "One composer, seven platforms at once", has: [true, true, false, false] },
    { label: "A calendar, drafts and per-platform settings", has: [true, true, false, false] },
    { label: "A comment becomes a DM, with a public reply", has: [true, false, true, false] },
    { label: "Keyword DMs and story replies", has: [true, false, true, false] },
    { label: "Follow-ups that skip whoever already tapped", has: [true, false, true, false] },
    { label: "Email capture inside the conversation", has: [true, false, true, false] },
    { label: "Videos scored against their own channel’s median", has: [true, false, false, true] },
    { label: "Hooks, outlines and scripts from a winner", has: [true, false, false, true] },
    { label: "A workspace per client, one pooled allowance", has: [true, false, false, false] },
    { label: "One bill, one login, one dashboard", has: [true, false, false, false] },
  ];
  return (
    <section id="compare" data-theme="dark" className="bg-bg text-ink">
      <Container className="py-20 shell:py-28">
        <Opening
          align="center"
          title="Three subscriptions, or this one."
          lede="Most people run a posting tool, a DM tool and a research tool side by side. Here is the same work in one column."
        />

        {/* `relative` is load-bearing, not decoration. The .sr-only spans in
            the cells are position:absolute, and an absolutely positioned box
            is clipped by an overflow ancestor only when that ancestor is also
            its containing block. Without this the table scrolled inside its
            own box as intended while its screen-reader labels sat at x=585 in
            the document, giving the whole PAGE 196px of sideways scroll into
            blank space on a 390px phone. */}
        <div className="mf-noscroll relative mt-12 overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-left">
            <thead>
              <tr>
                <th className="w-[38%] pb-4 text-[13px] font-semibold text-faint">
                  What you need it to do
                </th>
                {columns.map((column, index) => (
                  <th
                    key={column}
                    className={cx(
                      "pb-4 text-center text-[13.5px] font-semibold",
                      index === 0 ? "text-accent" : "text-faint",
                    )}
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-t border-line">
                  <th
                    scope="row"
                    className="py-3.5 pr-6 text-[14.5px]/[21px] font-medium text-ink text-pretty"
                  >
                    {row.label}
                  </th>
                  {row.has.map((yes, index) => (
                    <td key={columns[index]} className="py-3.5 text-center">
                      <span
                        className={cx(
                          "inline-flex h-6 w-6 items-center justify-center rounded-full",
                          yes
                            ? index === 0
                              ? "bg-accent text-accent-ink"
                              : "bg-accent-soft text-accent"
                            : "text-faint",
                        )}
                      >
                        <Icon
                          name={yes ? "check" : "minus"}
                          className="h-3.5 w-3.5"
                          strokeWidth={2.4}
                        />
                        <span className="sr-only">{yes ? "Yes" : "No"}</span>
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-6 text-center text-[13.5px] text-faint text-pretty">
          Categories, not brand names — hold whatever you pay for today against
          the same rows.
        </p>
      </Container>
    </section>
  );
}

// ── what the stack costs ───────────────────────────────────────────────────

function Stack() {
  return (
    <section id="stack">
      <Container className="py-20 shell:py-28">
        <Opening
          align="center"
          title="See what that stack costs you."
          lede="Put your own numbers in. The only figures we supply are ours."
        />
        <div className="mt-12">
          <StackCalculator />
        </div>
      </Container>
    </section>
  );
}

// ── plans ──────────────────────────────────────────────────────────────────

function Plans() {
  return (
    <section id="plans" className="mf-band border-t border-line">
      <Container className="py-20 shell:py-28">
        <Opening
          align="center"
          title="Plans that say what they cost."
          lede="Unlimited where it is genuinely unlimited. X carries a monthly number on every paid plan, stated on the plan itself rather than in fine print."
        />
        <PlanGrid plans={PLANS} />
        <p className="mt-8 text-center text-[14px] text-muted">
          Annual billing is two months free.{" "}
          <Link href="/pricing" className="font-semibold text-accent transition-opacity duration-110 hover:opacity-75">
            See the full comparison
          </Link>
        </p>
      </Container>
    </section>
  );
}

// ── questions ──────────────────────────────────────────────────────────────

function Questions() {
  return (
    <section id="faq">
      <Container className="py-20 shell:py-28">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-10 wide:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] wide:gap-16">
          <div>
            <Opening
              title="Still have questions?"
              lede="The ones people ask before they connect an account, and the honest answers."
            />
            <a
              href="mailto:support@markedfox.com"
              className={buttonClass("secondary", "md", "mt-6")}
            >
              <Icon name="mail" className="h-4 w-4" />
              support@markedfox.com
            </a>
          </div>
          <Faq />
        </div>
      </Container>
    </section>
  );
}

// ── closer ─────────────────────────────────────────────────────────────────

function Closer() {
  return (
    <section className="bg-dock text-dock-hover">
      <Container className="py-20 text-center shell:py-28">
        <FoxMark className="mx-auto h-[56px]" />
        <h2 className="font-display mx-auto mt-8 max-w-[760px] text-[32px]/[38px] font-bold tracking-[-0.03em] text-balance shell:text-[48px]/[54px]">
          Buffer publishes. ManyChat automates. The fox does both — then
          tells you what to make next.
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-[16px]/[25px] text-[rgba(255,255,255,0.72)] text-pretty">
          Free includes two posts a day, three connected accounts per
          workspace, and a working DM rule. No card, no trial clock.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link href="/signup" className={buttonClass("primary", "lg")}>
            Start free
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center rounded-lg border border-[rgba(255,255,255,0.22)] px-5 py-3 text-[15px] font-semibold whitespace-nowrap text-dock-hover transition-[background-color,scale] duration-110 hover:bg-[rgba(255,255,255,0.08)] active:scale-[0.97]"
          >
            See pricing
          </Link>
        </div>
      </Container>
    </section>
  );
}
