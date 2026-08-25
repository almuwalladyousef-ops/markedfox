"use client";

import { useState } from "react";

import { segmentedItem, segmentedTrack } from "@/components/ui";
import { THEME_COOKIE, type Theme } from "@/lib/theme";

// Two controls, one writer. Both the sidebar icon and the Settings segmented
// control call `apply`, which writes all three places the theme lives: the
// attribute (what the page paints from), localStorage (what a browser without
// the cookie falls back to), and the cookie (what the server renders from on
// the next request, so there is no flash).

function apply(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_COOKIE, theme);
  } catch {
    // Private-mode Safari throws on write. The cookie below still carries it.
  }
  document.cookie = `${THEME_COOKIE}=${theme};path=/;max-age=31536000;samesite=lax`;
}

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[13px] w-[13px]"
      aria-hidden
    >
      <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      className="h-[13px] w-[13px]"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

/** The 26×26 icon button at the bottom of the sidebar. */
export function ThemeToggle({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  const dark = theme === "dark";

  return (
    <button
      type="button"
      title={dark ? "Switch to light" : "Switch to dark"}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => {
        const next: Theme = dark ? "light" : "dark";
        apply(next);
        setTheme(next);
      }}
      className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-line-strong hover:text-ink"
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

/** The Light / Dark segmented control in Settings → Appearance. */
export function ThemeSegmented({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);

  return (
    <div className={segmentedTrack}>
      {(["light", "dark"] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => {
            apply(option);
            setTheme(option);
          }}
          aria-pressed={theme === option}
          className={segmentedItem(theme === option, "capitalize")}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
