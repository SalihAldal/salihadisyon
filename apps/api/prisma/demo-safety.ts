function parseDatabaseUrl(databaseUrl: string) {
  try {
    const url = new URL(databaseUrl);
    const databaseName = url.pathname.replace(/^\//, "").split("?")[0] ?? "";
    return {
      host: url.hostname.toLowerCase(),
      databaseName: databaseName.toLowerCase(),
    };
  } catch {
    return {
      host: "",
      databaseName: databaseUrl.toLowerCase(),
    };
  }
}

function isProductionLikeValue(value: string) {
  return /(prod|production|live)/i.test(value);
}

export function assertSafeDemoEnvironment(mode: "seed" | "reset") {
  const nodeEnv = String(process.env.NODE_ENV ?? "").toLowerCase();
  const appEnv = String(process.env.APP_ENV ?? "").toLowerCase();
  const databaseUrl = String(process.env.DATABASE_URL ?? "");

  if (!databaseUrl) {
    throw new Error("DATABASE_URL tanimli olmadan demo veri islemi calistirilamaz.");
  }

  const { host, databaseName } = parseDatabaseUrl(databaseUrl);
  const safeAppEnvironments = new Set(["development", "dev", "local", "demo", "test"]);
  const safeHosts = new Set(["localhost", "127.0.0.1", "postgres", "db"]);
  const safeDatabaseNames = /(dev|demo|local|test|adisyon)/i;

  if (nodeEnv === "production" || appEnv === "production") {
    throw new Error(`Demo ${mode} islemi production ortaminda calistirilamaz.`);
  }

  if (isProductionLikeValue(databaseUrl) || isProductionLikeValue(host) || isProductionLikeValue(databaseName)) {
    throw new Error(`Demo ${mode} islemi production benzeri bir veritabani hedefinde engellendi.`);
  }

  if (!safeAppEnvironments.has(appEnv) && !safeAppEnvironments.has(nodeEnv)) {
    throw new Error(`Demo ${mode} islemi sadece development/local/test ortamlarinda calisabilir.`);
  }

  if (!safeHosts.has(host) && !safeDatabaseNames.test(databaseName)) {
    throw new Error(`Demo ${mode} islemi guvenli olmayan veritabani hedefinde engellendi: ${host || "unknown-host"}`);
  }
}
