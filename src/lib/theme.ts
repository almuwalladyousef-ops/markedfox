export type Theme = "light" | "dark";

/** Read on the server to render `data-theme` on the first paint, written by
 *  the client alongside localStorage so the two never disagree. */
export const THEME_COOKIE = "mf-theme";

export const DEFAULT_THEME: Theme = "light";

export function normalizeTheme(value: string | undefined | null): Theme {
  return value === "dark" ? "dark" : DEFAULT_THEME;
}

/**
 * Runs before paint. The cookie is the primary source — this only covers the
 * browser that has a localStorage choice but no cookie yet (a returning user
 * from before the cookie existed, or one whose cookie was cleared), which
 * would otherwise flash the default theme.
 */
export const THEME_BOOTSTRAP = `try{var t=localStorage.getItem("${THEME_COOKIE}");if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t);document.cookie="${THEME_COOKIE}="+t+";path=/;max-age=31536000;samesite=lax"}}catch(e){}`;
