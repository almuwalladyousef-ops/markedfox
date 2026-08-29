import Link from "next/link";

import { ButtonLink, FoxMark } from "@/components/ui";

// The 404 for anything outside the dashboard shell — a mistyped URL, a dead
// link from somewhere else. Without this file Next renders its own unstyled
// page, which is the one screen a lost visitor was guaranteed to see.
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-bg px-4 py-12 text-center text-ink">
      <Link href="/" aria-label="MarkedFox home">
        <FoxMark className="h-9" />
      </Link>
      <div>
        <h1 className="font-display text-[30px]/[36px] font-bold tracking-[-0.025em]">
          There&rsquo;s nothing here
        </h1>
        <p className="mx-auto mt-2 max-w-md text-[15px]/[24px] text-pretty text-muted">
          The page may have moved, or the link was mistyped. Nothing was lost.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <ButtonLink href="/dashboard" tone="primary">
          Open the dashboard
        </ButtonLink>
        <ButtonLink href="/">Go to the home page</ButtonLink>
      </div>
    </main>
  );
}
