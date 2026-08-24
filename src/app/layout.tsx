import type { Metadata } from "next";
import { Bricolage_Grotesque, Public_Sans } from "next/font/google";
import { cookies } from "next/headers";

import { normalizeTheme, THEME_BOOTSTRAP, THEME_COOKIE } from "@/lib/theme";

import "./globals.css";

// Display face for headings and numerals, body face for everything else —
// the pairing the redesign handoff specifies.
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-bricolage",
  display: "swap",
});
const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-public-sans",
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
    <html lang="en" data-theme={theme} className={`${bricolage.variable} ${publicSans.variable}`}>
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
