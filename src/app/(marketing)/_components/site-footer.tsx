import Link from "next/link";

// The site-wide footer, patterned after the four-column layout the owner
// asked for (2026-08-19): brand + social icons on the left, link columns on
// the right, copyright at the bottom. Only links that exist are listed — a
// footer link to a dead page reads as an abandoned product.
//
// Static on purpose: imports nothing from src/lib, so every marketing page
// keeps prerendering with zero environment variables set.

// The reserved @markedfox handles (CLAUDE.md Phase 0). These accounts exist
// as part of the transferable brand package; linking them is free trust.
const SOCIALS = [
  { name: "Instagram", href: "https://instagram.com/markedfox", icon: InstagramIcon },
  { name: "X", href: "https://x.com/markedfox", icon: XIcon },
  { name: "TikTok", href: "https://tiktok.com/@markedfox", icon: TikTokIcon },
  { name: "YouTube", href: "https://youtube.com/@markedfox", icon: YouTubeIcon },
  { name: "Threads", href: "https://threads.com/@markedfox", icon: ThreadsIcon },
] as const;

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
    <footer className="border-t border-neutral-900">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="flex flex-col gap-12 md:flex-row md:justify-between">
          <div className="flex max-w-xs flex-col gap-6">
            <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
              <FoxMark className="h-6 w-6" />
              MarkedFox
            </Link>

            <ul className="flex items-center gap-4">
              {SOCIALS.map(({ name, href, icon: Icon }) => (
                <li key={name}>
                  <a
                    href={href}
                    aria-label={`MarkedFox on ${name}`}
                    className="text-neutral-500 transition hover:text-neutral-200"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Icon className="h-5 w-5" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-x-12 gap-y-10 sm:grid-cols-4">
            {COLUMNS.map((column) => (
              <div key={column.heading}>
                <h3 className="text-sm text-neutral-500">{column.heading}</h3>
                <ul className="mt-4 flex flex-col gap-3">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      {link.href.startsWith("mailto:") ? (
                        <a
                          href={link.href}
                          className="text-sm font-medium text-neutral-200 transition hover:text-white"
                        >
                          {link.label}
                        </a>
                      ) : (
                        <Link
                          href={link.href}
                          className="text-sm font-medium text-neutral-200 transition hover:text-white"
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

        <p className="mt-14 text-sm text-neutral-600">
          © 2026 MarkedFox. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

// A minimal fox mark: two ears and a muzzle, one path. Placeholder until a
// real logo exists; consistent everywhere it appears.
export function FoxMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M3 4l4 4h10l4-4v7c0 5-4 9-9 9s-9-4-9-9V4z"
        fill="#f97316"
      />
      <path d="M9 13l3 4 3-4" fill="#0a0a0a" />
    </svg>
  );
}

type IconProps = { className?: string };

function InstagramIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function XIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
    </svg>
  );
}

function TikTokIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  );
}

function YouTubeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

function ThreadsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.586-1.308-.883-2.359-.89h-.029c-.844 0-1.992.232-2.721 1.32L7.734 7.847c.98-1.454 2.568-2.256 4.478-2.256h.044c3.194.02 5.097 1.975 5.287 5.388.108.046.216.094.321.142 1.49.7 2.58 1.761 3.154 3.07.797 1.82.871 4.79-1.548 7.158-1.85 1.81-4.094 2.628-7.277 2.65Zm1.003-11.69c-.242 0-.487.007-.739.021-1.836.103-2.98.946-2.916 2.143.067 1.256 1.452 1.839 2.784 1.767 1.224-.065 2.818-.543 3.086-3.71a10.5 10.5 0 0 0-2.215-.221z" />
    </svg>
  );
}
