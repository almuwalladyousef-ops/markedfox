import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    // fileURLToPath keeps the alias correct despite the space in the volume path.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
