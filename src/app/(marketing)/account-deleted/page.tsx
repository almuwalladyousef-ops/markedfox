import type { Metadata } from "next";

import Link from "next/link";

export const metadata: Metadata = {
  title: "Account deleted · MarkedFox",
  robots: { index: false },
};

// Where a self-serve account deletion lands. Static, no session — there is
// no user left to have one.
export default function AccountDeletedPage() {
  return (
    <main className="mx-auto max-w-xl px-6 py-24 text-center">
      <h1 className="text-3xl font-bold tracking-tight">Your account is deleted</h1>
      <p className="mt-4 text-neutral-400">
        Your MarkedFox account, workspaces, connected accounts and their
        tokens, posts, automation rules, and uploaded media have been removed.
        Where a platform offers it, we also told the platform to revoke the
        access you granted; you can double-check in each platform&apos;s
        connected-apps settings.
      </p>
      <p className="mt-4 text-neutral-400">
        Sorry to see you go. If something was broken, tell us —{" "}
        <a className="underline" href="mailto:support@markedfox.com">
          support@markedfox.com
        </a>
        .
      </p>
      <Link
        href="/"
        className="mt-8 inline-block rounded-md border border-neutral-800 px-4 py-2 text-sm text-neutral-300 transition hover:border-neutral-600 hover:text-white"
      >
        Back to markedfox.com
      </Link>
    </main>
  );
}
