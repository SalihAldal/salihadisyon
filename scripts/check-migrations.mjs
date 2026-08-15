import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const migrationRoot = path.resolve("apps/api/prisma/migrations");
const destructivePatterns = [
  /DROP\s+TABLE/i,
  /DROP\s+COLUMN/i,
  /TRUNCATE\s+TABLE/i,
  /DELETE\s+FROM/i,
  /ALTER\s+TABLE.+DROP\s+CONSTRAINT/i,
];

async function main() {
  const entries = await readdir(migrationRoot, { withFileTypes: true });
  const migrationDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  const targetMigration = process.env.MIGRATION_DIR || migrationDirs.at(-1);

  if (!targetMigration) {
    console.log("Migration bulunamadi, audit atlandi.");
    return;
  }

  const filePath = path.join(migrationRoot, targetMigration, "migration.sql");
  const findings = [];

  try {
    const sql = await readFile(filePath, "utf8");
    const hits = destructivePatterns.filter((pattern) => pattern.test(sql)).map((pattern) => pattern.source);
    if (hits.length > 0) {
      findings.push({ migration: targetMigration, hits });
    }
  } catch {
    console.log(`Migration dosyasi bulunamadi: ${targetMigration}`);
    return;
  }

  if (findings.length > 0) {
    console.error(`Destructive migration riski tespit edildi (${targetMigration}):`);
    for (const item of findings) {
      console.error(`- ${item.migration}: ${item.hits.join(", ")}`);
    }
    process.exit(1);
  }

  console.log(`Migration audit temiz. Kontrol edilen migration: ${targetMigration}`);
}

main().catch((error) => {
  console.error("Migration audit calistirilamadi.", error);
  process.exit(1);
});
