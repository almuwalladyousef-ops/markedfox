import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The VPS runs the app via systemd as `node .next/standalone/server.js`.
  output: "standalone",

  // /dashboard/posts was its own list until the calendar absorbed it — the
  // schedule and the outcomes are the same information twice. Anyone holding
  // a bookmark, or an email we sent, lands where that post now lives.
  async redirects() {
    return [
      { source: "/dashboard/posts", destination: "/dashboard/calendar", permanent: false },
    ];
  },
};

export default nextConfig;
