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
      {/* The wrapper is load-bearing: the pane lays its children out in a flex
          column, which stretches an inline-flex track to the full width. */}
      <div className="flex">
        <ThemeSegmented initial={theme} />
      </div>
    </Pane>
  );
}
