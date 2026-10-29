import { defineConfig, mergeConfig } from "vitest/config";

import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",

      globals: true,

      setupFiles: ["./src/test/setup.ts"],

      clearMocks: true,

      restoreMocks: true,

      include: [
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "src/**/*.spec.ts",
        "src/**/*.spec.tsx",
      ],

      exclude: ["**/node_modules/**", "**/dist/**"],
    },
  }),
);
