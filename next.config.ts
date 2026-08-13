import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The VPS runs the app via systemd as `node .next/standalone/server.js`.
  output: "standalone",
};

export default nextConfig;
