import type { Metadata } from "next";

import Link from "next/link";

import { FoxMark } from "@/components/ui";

export const metadata: Metadata = {
  title: "MarkedFox — publish everywhere, automate every DM",
  description:
    "One composer for Instagram, TikTok, YouTube, X, Facebook, Threads and Snapchat, plus ManyChat-style DM and comment automation. One tool instead of two subscriptions.",
};

// The public landing page. Static and env-free by design. The copy leans on
// the one-line pitch from CLAUDE.md: everything ManyChat does plus everything
// Buffer does, for less than either.

const PLATFORM_NAMES = [
  "Instagram",
  "TikTok",
  "YouTube",
  "X",
  "Facebook",
  "Threads",
  "Snapchat",
];

const PILLARS = [
  {
    id: "publisher",
    eyebrow: "Publish",
    title: "Write once, post everywhere",
    body: "One composer, any mix of connected accounts, publish now or schedule. Every platform's limits — caption length, media rules, formats — are checked while you type, never after you hit publish.",
  },
  {
    id: "automation",
    eyebrow: "Automate",
    title: "Comments in, conversations out",
    body: "The part ManyChat charges for, built in. Comment and keyword triggers, per-post targeting, public replies, and follow-ups that skip anyone who already clicked.",
  },
  {
    id: "research",
    eyebrow: "Research",
    title: "Find what already worked",
    body: "Watch a channel and MarkedFox flags the videos that beat that channel's own average, breaks down why they worked, and writes from the mechanism rather than the wording.",
  },
];

export default function Home() {
  return (
    <main>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="mx-auto grid max-w-[1120px] items-center gap-12 px-6 pt-[72px] pb-16 wide:grid-cols-[1.05fr_1fr]">
        <div>
          <p className="inline-flex rounded-full bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent">
            One tool. Two subscriptions replaced.
          </p>
          <h1 className="font-display mt-5 text-[38px]/[44px] font-bold tracking-[-0.03em] shell:text-[54px]/[58px]">
            Write once.
            <br />
            Post everywhere.
          </h1>
          <p className="mt-5 max-w-[460px] text-[16.5px]/[25px] text-muted">
            One composer for every platform — and the comment-to-DM automation
            ManyChat charges for, built in. For less than either tool it
            replaces.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/signup"
              className="rounded-xl bg-accent px-[22px] py-[13px] text-sm font-semibold text-accent-ink transition hover:brightness-[1.08]"
            >
              Start free — no card
            </Link>
            <Link
              href="/pricing"
              className="rounded-xl border border-line-strong px-[22px] py-[13px] text-sm font-medium text-ink transition hover:border-accent hover:text-accent"
            >
              See pricing
            </Link>
          </div>

          <ul className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] font-medium text-faint">
            {PLATFORM_NAMES.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>

        {/* The two mock cards. Not a screenshot: a screenshot of a product
            still in review dates the moment anything moves, and these say the
            same thing — one composer, and a DM that goes out by itself. */}
        <div className="relative pb-8 wide:pb-16">
          <div className="max-w-[400px] rounded-[18px] border border-line bg-panel p-5 shadow-panel">
            <p className="text-[11px] font-semibold tracking-[0.06em] text-faint uppercase">
              Compose
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {["Instagram", "TikTok", "YouTube"].map((name) => (
                <span
                  key={name}
                  className="inline-flex items-center gap-1.5 rounded-full border border-accent bg-accent-soft px-3 py-1.5 text-[12px] font-medium text-ink"
                >
                  <span aria-hidden className="h-[6px] w-[6px] rounded-full bg-accent" />
                  {name}
                </span>
              ))}
            </div>
            <p className="mt-3 rounded-xl bg-chip px-3.5 py-3 text-[13px]/[19px] text-ink">
              Three things I wish I knew before my first 100k views 👇
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-faint">
              <span>Instagram 58/2,200</span>
              <span>TikTok 58/2,200</span>
              <span>YouTube 58/5,000</span>
            </div>
            <div className="mt-3.5 flex items-center justify-between gap-3">
              <span className="rounded-full bg-sky-soft px-2.5 py-1 text-[11px] font-semibold text-sky">
                Fri 9:00 AM
              </span>
              <span className="rounded-[10px] bg-accent px-4 py-2 text-[12.5px] font-semibold text-accent-ink">
                Schedule
              </span>
            </div>
          </div>

          <div className="mt-4 w-[250px] rounded-[18px] border border-line bg-panel p-4 shadow-panel wide:absolute wide:-right-4 wide:-bottom-16 wide:mt-0">
            <p className="text-[11px] font-semibold tracking-[0.06em] text-faint uppercase">
              Automation
            </p>
            <p className="mt-2.5 rounded-xl bg-chip px-3 py-2 text-[11.5px]/[16px] text-muted">
              <span className="font-semibold text-ink">@someone</span> LINK
            </p>
            <p className="mt-2 ml-[18px] rounded-xl bg-accent px-3 py-2 text-[11.5px]/[16px] text-accent-ink">
              Sent! Here it is —{" "}
              <span className="underline">markedfox.com/guide</span>
            </p>
            <p className="mt-2.5 text-[11px] text-ok">
              Sent automatically · 0.4s after the comment
            </p>
          </div>
        </div>
      </section>

      {/* ── Three pillars ────────────────────────────────────────────── */}
      <section className="border-t border-line bg-panel">
        <div className="mx-auto grid max-w-[1120px] gap-4 px-6 py-16 wide:grid-cols-3">
          {PILLARS.map((pillar) => (
            <div
              key={pillar.id}
              id={pillar.id}
              className="rounded-2xl border border-line bg-bg p-[22px]"
            >
              <p className="text-xs font-bold tracking-[0.05em] text-accent uppercase">
                {pillar.eyebrow}
              </p>
              <h2 className="font-display mt-2 text-[19px] font-bold tracking-[-0.02em]">
                {pillar.title}
              </h2>
              <p className="mt-3 text-[13.5px]/[20px] text-muted">
                {pillar.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Closer ───────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1120px] px-6 py-20 text-center">
        <FoxMark className="mx-auto h-[60px]" />
        <h2 className="font-display mt-6 text-[30px]/[38px] font-bold tracking-[-0.02em]">
          Buffer publishes. ManyChat automates.
          <br />
          The fox does both — for less.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[13.5px]/[20px] text-muted">
          Free includes 2 posts a day, 3 connected accounts, and a working DM
          rule. No card, no trial clock.
        </p>
        <Link
          href="/signup"
          className="mt-8 inline-block rounded-xl bg-accent px-[22px] py-[13px] text-sm font-semibold text-accent-ink transition hover:brightness-[1.08]"
        >
          Start free
        </Link>
      </section>
    </main>
  );
}
