import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MarkedFox",
  description: "Publish everywhere. Automate every DM.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      {/* Base colours live here so every route inherits them. Without this a
          page that sets light text but no background renders invisibly on the
          browser's default white — which is exactly what /dashboard did. */}
      <body className="bg-neutral-950 text-neutral-50 antialiased">
        {children}
      </body>
    </html>
  );
}
