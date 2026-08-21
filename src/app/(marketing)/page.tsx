import type { Metadata } from "next";

import Link from "next/link";

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

export default function Home() {
  return (
    <main>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-24 text-center">
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
          Publish everywhere.
          <br />
          Automate every DM.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted">
          One composer that posts to every platform at once, and comment-to-DM
          automation that turns your audience into conversations — in one tool,
          for less than either of the tools it replaces.
        </p>
        <div className="mt-10 flex items-center justify-center gap-3">
          <Link
            href="/signup"
            className="rounded-md bg-accent px-5 py-3 text-sm font-semibold text-accent-ink transition hover:brightness-[1.08]"
          >
            Start free
          </Link>
          <Link
            href="/pricing"
            className="rounded-md border border-line px-5 py-3 text-sm text-ink transition hover:border-line-strong hover:text-white"
          >
            See pricing
          </Link>
        </div>

        <ul className="mt-14 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-faint">
          {PLATFORM_NAMES.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      </section>

      {/* ── Publisher ────────────────────────────────────────────────── */}
      <section id="publisher" className="border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 md:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-orange-400">Publisher</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">
              Write once, post everywhere
            </h2>
            <p className="mt-4 text-muted">
              Compose one post, pick any mix of connected accounts, and publish
              or schedule to all of them at once. Every platform&apos;s limits —
              caption length, media rules, formats — are checked while you
              type, never after you hit publish.
            </p>
          </div>
          <ul className="flex flex-col gap-4 text-sm text-ink">
            <Feature title="Every account, one place">
              Connect multiple accounts per platform across separate workspaces
              — one per brand or client.
            </Feature>
            <Feature title="Scheduling that just runs">
              Queue posts for any time; they publish on the server, no open
              browser tab required.
            </Feature>
            <Feature title="Per-platform captions">
              Override the caption for any platform without rewriting the whole
              post.
            </Feature>
          </ul>
        </div>
      </section>

      {/* ── Automation ───────────────────────────────────────────────── */}
      <section id="automation" className="border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 md:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-orange-400">DM automation</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">
              Comments in, conversations out
            </h2>
            <p className="mt-4 text-muted">
              The part ManyChat charges for, built in. Trigger DMs from
              comments and keywords, target specific posts, and follow up with
              sequences — without a second subscription.
            </p>
          </div>
          <ul className="flex flex-col gap-4 text-sm text-ink">
            <Feature title="Comment-to-DM triggers">
              &ldquo;Comment LINK and I&apos;ll send it to you&rdquo; — handled
              automatically, around the clock, within your plan&apos;s monthly
              DM allowance.
            </Feature>
            <Feature title="Keyword matching">
              Route replies by what people actually say, per post or across the
              account.
            </Feature>
            <Feature title="Sequences">
              Multi-step follow-ups that keep running after the first reply.
            </Feature>
          </ul>
        </div>
      </section>

      {/* ── Closer ───────────────────────────────────────────────────── */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-6xl px-6 py-20 text-center">
          <h2 className="text-3xl font-bold tracking-tight">
            Two subscriptions&apos; work. One tool.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted">
            Buffer publishes but doesn&apos;t touch your DMs. ManyChat automates
            DMs but publishes nothing. MarkedFox does both.
          </p>
          <Link
            href="/signup"
            className="mt-8 inline-block rounded-md bg-accent px-5 py-3 text-sm font-semibold text-accent-ink transition hover:brightness-[1.08]"
          >
            Start free — no card required
          </Link>
        </div>
      </section>
    </main>
  );
}

function Feature({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="rounded-lg border border-line p-4">
      <p className="font-semibold text-ink">{title}</p>
      <p className="mt-1 text-muted">{children}</p>
    </li>
  );
}
