import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: ["qa-ui.spec.mjs", "qa-adisyon-final-e2e.spec.mjs", "stage1-visual-qa.spec.mjs"],
  timeout: 60_000,
  retries: 0,
  use: {
    headless: true,
    trace: "off",
  },
  reporter: [["list"]],
});
