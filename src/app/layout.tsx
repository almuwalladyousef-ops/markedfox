import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import { cookies } from "next/headers";

import { normalizeTheme, THEME_BOOTSTRAP, THEME_COOKIE } from "@/lib/theme";

import "./globals.css";

// Display face for headings and numerals. Body copy stays on the system stack,
// so this is the only webfont the product loads.
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MarkedFox",
  description: "Publish everywhere. Automate every DM.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Rendering the attribute server-side is what makes the theme flash-free:
  // the first byte of HTML already carries the right value.
  const theme = normalizeTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html lang="en" data-theme={theme} className={spaceGrotesk.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      {/* Base colours live here so every route inherits them. Without this a
          page that sets light text but no background renders invisibly on the
          browser's default white — which is exactly what /dashboard did. */}
      <body className="bg-bg text-ink antialiased">{children}</body>
    </html>
  );
}
