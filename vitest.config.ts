import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  resolve: {
    // fileURLToPath keeps the alias correct despite the space in the volume path.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws on import outside a React Server Component, which
      // is exactly what it is for — it keeps modules holding the service-role
      // key out of the client bundle. Under vitest there is no bundler to
      // report to, so it is stubbed rather than dropped: the guard stays real
      // in the build, and server modules stay testable.
      "server-only": fileURLToPath(
        new URL("./src/test/server-only-stub.ts", import.meta.url),
      ),
    },
  },
});
