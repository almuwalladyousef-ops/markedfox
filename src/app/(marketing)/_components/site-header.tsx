import Link from "next/link";

import { ButtonLink, FoxMark } from "@/components/ui";

// Shared header for the public marketing pages. Static: no session lookup —
// a logged-in visitor clicking Dashboard is routed by the proxy anyway, and
// keeping this env-free keeps every marketing page prerenderable.
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-panel">
      <div className="mx-auto flex max-w-[1120px] items-center justify-between px-6 py-3.5">
        <Link href="/" className="flex items-center gap-2.5">
          <FoxMark className="h-7" />
          {/* The wordmark yields on a phone — the fox alone is the brand at
              small sizes, and the four header items do not fit beside the
              full name at 390px without overlapping. */}
          <span className="font-display hidden text-lg font-bold tracking-[-0.02em] sm:inline">
            MarkedFox
          </span>
        </Link>

        <nav className="flex items-center gap-4 shell:gap-6">
          {/* Hidden on a phone for the same reason the wordmark is: four
              items is what fits beside the fox at 390px. */}
          <Link
            href="/#how"
            className="hidden text-[13.5px] font-medium whitespace-nowrap text-muted transition-colors hover:text-ink sm:inline"
          >
            How it works
          </Link>
          <Link
            href="/pricing"
            className="text-[13.5px] font-medium whitespace-nowrap text-muted transition-colors hover:text-ink"
          >
            Pricing
          </Link>
          <Link
            href="/login"
            className="text-[13.5px] font-medium whitespace-nowrap text-muted transition-colors hover:text-ink"
          >
            Log in
          </Link>
          <ButtonLink href="/signup" tone="primary" size="sm">
            Start free
          </ButtonLink>
        </nav>
      </div>
    </header>
  );
}
