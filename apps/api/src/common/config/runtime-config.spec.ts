import { describe, expect, it } from "vitest";
import { assertProductionRuntimeConfig, getApiRuntimeEnv } from "@adisyon/config";

describe("runtime config", () => {
  it("defaults API port to 4100", () => {
    expect(getApiRuntimeEnv({}).port).toBe(4100);
  });

  it("blocks insecure JWT secrets in production", () => {
    expect(() =>
      assertProductionRuntimeConfig({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://localhost/adisyon",
        JWT_ACCESS_SECRET: "change-me-access",
        JWT_REFRESH_SECRET: "change-me-refresh",
      }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it("disables auth login rate limit on local by default", () => {
    expect(getApiRuntimeEnv({ APP_ENV: "local", NODE_ENV: "development" }).authLoginRateLimitEnabled).toBe(false);
  });

  it("enables auth login rate limit on production by default", () => {
    expect(getApiRuntimeEnv({ APP_ENV: "production", NODE_ENV: "production" }).authLoginRateLimitEnabled).toBe(true);
  });

  it("honors AUTH_LOGIN_RATE_LIMIT_ENABLED override", () => {
    expect(getApiRuntimeEnv({ APP_ENV: "local", AUTH_LOGIN_RATE_LIMIT_ENABLED: "true" }).authLoginRateLimitEnabled).toBe(true);
  });
});
