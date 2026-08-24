import Link from "next/link";

import { PlatformTile } from "@/components/platform-icon";
import { FoxMark } from "@/components/ui";
import type { Platform } from "@/lib/platforms/types";

// The site-wide footer, patterned after the four-column layout the owner
// asked for (2026-08-19): brand + social icons on the left, link columns on
// the right, copyright at the bottom. Only links that exist are listed — a
// footer link to a dead page reads as an abandoned product.
//
// Static on purpose: imports nothing from src/lib, so every marketing page
// keeps prerendering with zero environment variables set.

// The reserved @markedfox handles (CLAUDE.md Phase 0). These accounts exist
// as part of the transferable brand package; linking them is free trust.
const SOCIALS: { name: string; href: string; platform: Platform }[] = [
  { name: "Instagram", href: "https://instagram.com/markedfox", platform: "instagram" },
  { name: "X", href: "https://x.com/markedfox", platform: "x" },
  { name: "TikTok", href: "https://tiktok.com/@markedfox", platform: "tiktok" },
  { name: "YouTube", href: "https://youtube.com/@markedfox", platform: "youtube" },
  { name: "Threads", href: "https://threads.com/@markedfox", platform: "threads" },
];

const COLUMNS: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: "Product",
    links: [
      { label: "Publisher", href: "/#publisher" },
      { label: "DM automation", href: "/#automation" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    heading: "Account",
    links: [
      { label: "Sign up", href: "/signup" },
      { label: "Log in", href: "/login" },
      { label: "Dashboard", href: "/dashboard" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Support", href: "mailto:support@markedfox.com" },
      { label: "Contact", href: "mailto:hello@markedfox.com" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy policy", href: "/privacy" },
      { label: "Terms of service", href: "/terms" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-panel">
      <div className="mx-auto max-w-[1120px] px-6 py-10">
        <div className="flex flex-col gap-10 shell:flex-row shell:justify-between">
          <div className="flex max-w-xs flex-col gap-5">
            <Link href="/" className="flex items-center gap-2.5">
              <FoxMark className="h-7" />
              <span className="font-display text-lg font-bold tracking-[-0.02em]">
                MarkedFox
              </span>
            </Link>

            <ul className="flex items-center gap-4">
              {SOCIALS.map(({ name, href, platform }) => (
                <li key={name}>
                  <a
                    href={href}
                    aria-label={`MarkedFox on ${name}`}
                    className="block opacity-85 transition-opacity hover:opacity-100"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <PlatformTile platform={platform} size={26} title={name} />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-x-12 gap-y-8 shell:grid-cols-4">
            {COLUMNS.map((column) => (
              <div key={column.heading}>
                <h3 className="text-[11.5px] font-semibold tracking-[0.04em] text-faint uppercase">
                  {column.heading}
                </h3>
                <ul className="mt-3.5 flex flex-col gap-2.5">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      {link.href.startsWith("mailto:") ? (
                        <a
                          href={link.href}
                          className="text-[13px] text-muted transition hover:text-ink"
                        >
                          {link.label}
                        </a>
                      ) : (
                        <Link
                          href={link.href}
                          className="text-[13px] text-muted transition hover:text-ink"
                        >
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-10 text-[13px] text-faint">
          © 2026 MarkedFox. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
