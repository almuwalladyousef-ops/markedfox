import type { Metadata } from "next";
import { cookies } from "next/headers";

import { ThemeSegmented } from "@/components/theme-toggle";
import { normalizeTheme, THEME_COOKIE } from "@/lib/theme";

import { Pane } from "../pane";

export const metadata: Metadata = { title: "Appearance · MarkedFox" };

export default async function AppearancePane() {
  const theme = normalizeTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <Pane
      title="Appearance"
      blurb="Light or dark. The choice is remembered on this browser and applied on the server, so pages do not flash the wrong one while they load."
    >
      <ThemeSegmented initial={theme} />
    </Pane>
  );
}
