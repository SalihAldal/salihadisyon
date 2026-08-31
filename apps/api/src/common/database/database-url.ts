/**
 * Ensures Prisma datasource URL includes conservative pool limits.
 */
export function buildDatabaseUrl(rawUrl?: string | null): string {
  const url = rawUrl?.trim();
  if (!url) {
    return "";
  }

  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("connection_limit")) {
      parsed.searchParams.set(
        "connection_limit",
        process.env.DATABASE_CONNECTION_LIMIT?.trim() || "10",
      );
    }
    if (!parsed.searchParams.has("pool_timeout")) {
      parsed.searchParams.set(
        "pool_timeout",
        process.env.DATABASE_POOL_TIMEOUT?.trim() || "10",
      );
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

export function parseDatabaseIdentity(databaseUrl: string) {
  const parsed = new URL(databaseUrl);
  return {
    database: parsed.pathname.replace(/^\//, "").split("?")[0] || "postgres",
    user: decodeURIComponent(parsed.username || "postgres"),
    password: decodeURIComponent(parsed.password || ""),
  };
}
