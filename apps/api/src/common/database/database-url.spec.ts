import { describe, expect, it } from "vitest";
import { buildDatabaseUrl, parseDatabaseIdentity } from "./database-url";

describe("buildDatabaseUrl", () => {
  it("adds connection pool limits when missing", () => {
    const url = buildDatabaseUrl("postgresql://postgres:postgres@localhost:5433/adisyon?schema=public");
    const parsed = new URL(url);
    expect(parsed.searchParams.get("connection_limit")).toBe("10");
    expect(parsed.searchParams.get("pool_timeout")).toBe("10");
    expect(parsed.searchParams.get("schema")).toBe("public");
  });

  it("preserves existing pool settings", () => {
    const url = buildDatabaseUrl(
      "postgresql://postgres:postgres@localhost:5433/adisyon?connection_limit=5&pool_timeout=3",
    );
    const parsed = new URL(url);
    expect(parsed.searchParams.get("connection_limit")).toBe("5");
    expect(parsed.searchParams.get("pool_timeout")).toBe("3");
  });
});

describe("parseDatabaseIdentity", () => {
  it("parses database user and name", () => {
    const identity = parseDatabaseIdentity("postgresql://postgres:secret@localhost:5433/adisyon?schema=public");
    expect(identity.database).toBe("adisyon");
    expect(identity.user).toBe("postgres");
    expect(identity.password).toBe("secret");
  });
});
