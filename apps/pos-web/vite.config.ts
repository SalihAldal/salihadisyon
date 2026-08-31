/// <reference types="vitest/config" />

import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // POS is served under nginx at `/adisyon/pos/` in production.
  // If you override `VITE_BASE_PATH`, keep a trailing slash.
  const base = env.VITE_BASE_PATH || (mode === "production" ? "/adisyon/pos/" : "/");

  return {
    base,
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      port: 3001,
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: "./src/test/setup.ts",
      coverage: {
        provider: "v8",
        reporter: ["text", "html"],
        reportsDirectory: "./coverage",
        include: ["src/**/*.ts", "src/**/*.tsx"],
        exclude: ["src/main.tsx"],
      },
    },
  };
});
