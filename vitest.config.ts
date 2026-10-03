// Test-only config: the app's vite.config.ts carries the full app plugin stack,
// which tests don't need. Cold dynamic imports in a few tests exceed vitest's
// 5s default under full-suite load, so the limit is raised here.
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  esbuild: { jsx: "automatic" },
  test: { testTimeout: 30000 },
});
