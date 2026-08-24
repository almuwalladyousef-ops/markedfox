// Put ffmpeg's core next to the app so it is served from our own origin.
//
// Not committed: the wasm is 31MB, which is not something a git history should
// carry for a file npm already pins. It is copied out of node_modules before
// every build and dev run instead, which means the deploy gets it too — the
// box runs `npm ci && npm run build`, and `prebuild` fires in between.
//
// Same-origin matters beyond taste: ffmpeg's worker pulls the core in with
// importScripts, which a cross-origin URL would refuse without CORS, and a CDN
// would put a third-party request in the middle of somebody publishing.
import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const from = join(root, "node_modules", "@ffmpeg", "core", "dist", "umd");
const to = join(root, "public", "ffmpeg");

if (!existsSync(from)) {
  // Not fatal: the app builds and runs without it, and only the trim needs it.
  console.warn("[ffmpeg] @ffmpeg/core is not installed — skipping the copy.");
  process.exit(0);
}

await mkdir(to, { recursive: true });
for (const name of ["ffmpeg-core.js", "ffmpeg-core.wasm"]) {
  await copyFile(join(from, name), join(to, name));
  console.log(`[ffmpeg] public/ffmpeg/${name}`);
}
