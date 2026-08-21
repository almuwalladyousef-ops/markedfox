import Link from "next/link";

import { FoxMark } from "./site-footer";

// Shared header for the public marketing pages. Static: no session lookup —
// a logged-in visitor clicking Dashboard is routed by the proxy anyway, and
// keeping this env-free keeps every marketing page prerenderable.
export function SiteHeader() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <FoxMark className="h-6 w-6" />
          MarkedFox
        </Link>

        <nav className="flex items-center gap-2 sm:gap-4">
          <Link
            href="/pricing"
            className="rounded-md px-3 py-2 text-sm text-ink transition hover:text-white"
          >
            Pricing
          </Link>
          <Link
            href="/login"
            className="rounded-md px-3 py-2 text-sm text-ink transition hover:text-white"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-ink transition hover:brightness-[1.08]"
          >
            Get started
          </Link>
        </nav>
      </div>
    </header>
  );
}
