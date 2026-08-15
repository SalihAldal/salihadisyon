import "dotenv/config";
import { execFileSync } from "node:child_process";

function parseDatabaseUrl(databaseUrl) {
  try {
    const url = new URL(databaseUrl);
    return {
      host: url.hostname.toLowerCase(),
      databaseName: url.pathname.replace(/^\//, "").split("?")[0].toLowerCase(),
    };
  } catch {
    return {
      host: "",
      databaseName: String(databaseUrl || "").toLowerCase(),
    };
  }
}

function assertSafeDemoEnvironment(mode) {
  const nodeEnv = String(process.env.NODE_ENV ?? "").toLowerCase();
  const appEnv = String(process.env.APP_ENV ?? "").toLowerCase();
  const databaseUrl = String(process.env.DATABASE_URL ?? "");
  const { host, databaseName } = parseDatabaseUrl(databaseUrl);

  if (!databaseUrl) {
    throw new Error("DATABASE_URL tanimli olmadan demo reset calistirilamaz.");
  }

  if (nodeEnv === "production" || appEnv === "production") {
    throw new Error(`Demo ${mode} islemi production ortaminda calistirilamaz.`);
  }

  if (/(prod|production|live)/i.test(databaseUrl) || /(prod|production|live)/i.test(host) || /(prod|production|live)/i.test(databaseName)) {
    throw new Error(`Demo ${mode} islemi production benzeri bir veritabani hedefinde engellendi.`);
  }

  if (!["development", "dev", "local", "demo", "test"].includes(appEnv || nodeEnv)) {
    throw new Error(`Demo ${mode} islemi sadece development/local/test ortamlarinda calisabilir.`);
  }
}

function run(command, args) {
  const executable = process.platform === "win32" ? `${command}.cmd` : command;
  execFileSync(executable, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  });
}

assertSafeDemoEnvironment("reset");

console.log("Demo development veritabani resetleniyor...");
run("pnpm", ["exec", "prisma", "migrate", "reset", "--force", "--skip-seed"]);

console.log("Prisma client yeniden uretiliyor...");
run("pnpm", ["exec", "prisma", "generate", "--schema", "prisma/schema.prisma"]);

console.log("Demo veriler tekrar yukleniyor...");
run("pnpm", ["exec", "ts-node", "prisma/seed.ts"]);

console.log("Demo reset tamamlandi.");
