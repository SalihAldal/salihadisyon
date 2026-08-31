import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { parseDatabaseIdentity } from "../../common/database/database-url";

export type PgToolResolution = {
  mode: "native" | "docker";
  command: string;
  container?: string;
};

async function pathExists(filePath: string) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function commandWorks(command: string) {
  return new Promise<boolean>((resolve) => {
    const child = spawn(command, ["--version"], {
      shell: false,
      stdio: "ignore",
      windowsHide: true,
    });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

async function dockerContainerRunning(container: string) {
  return new Promise<boolean>((resolve) => {
    const child = spawn("docker", ["inspect", "-f", "{{.State.Running}}", container], {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0 && stdout.trim() === "true"));
  });
}

export async function resolvePgTool(tool: "pg_dump" | "pg_restore"): Promise<PgToolResolution> {
  const envKey = tool === "pg_dump" ? "PG_DUMP_PATH" : "PG_RESTORE_PATH";
  const configured = process.env[envKey]?.trim() || tool;

  if (configured.includes("/") || configured.includes("\\")) {
    if (await pathExists(configured)) {
      return { mode: "native", command: configured };
    }
  } else if (await commandWorks(configured)) {
    return { mode: "native", command: configured };
  }

  if (process.env.PG_DOCKER_ENABLED === "false") {
    throw new Error(`${tool} bulunamadi ve PG_DOCKER_ENABLED=false.`);
  }

  const container = process.env.PG_DOCKER_CONTAINER?.trim() || "adisyon-postgres";
  if (!(await dockerContainerRunning(container))) {
    throw new Error(
      `${tool} bulunamadi. Docker container '${container}' calismiyor veya PG_DUMP_PATH/PG_RESTORE_PATH gecersiz.`,
    );
  }

  return { mode: "docker", command: tool, container };
}

function runProcess(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      reject(
        new Error(
          error.message.includes("ENOENT")
            ? `${command} komutu bulunamadi. PG_DUMP_PATH / PG_RESTORE_PATH veya Docker ayarini kontrol et.`
            : error.message,
        ),
      );
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `${command} komutu ${code} koduyla sonlandi.`));
    });
  });
}

export async function runPgDump(databaseUrl: string, outputFile: string) {
  const resolved = await resolvePgTool("pg_dump");
  const { database, user } = parseDatabaseIdentity(databaseUrl);

  if (resolved.mode === "native") {
    await runProcess(resolved.command, [
      "--format=custom",
      "--compress=9",
      "--no-owner",
      "--no-privileges",
      `--file=${outputFile}`,
      databaseUrl,
    ]);
    return;
  }

  const remotePath = `/tmp/adisyon-backup-${Date.now()}.dump`;
  await runProcess("docker", [
    "exec",
    resolved.container!,
    "pg_dump",
    "-U",
    user,
    "-d",
    database,
    "--format=custom",
    "--compress=9",
    "--no-owner",
    "--no-privileges",
    "-f",
    remotePath,
  ]);
  await runProcess("docker", ["cp", `${resolved.container}:${remotePath}`, outputFile]);
  await runProcess("docker", ["exec", resolved.container!, "rm", "-f", remotePath]).catch(() => undefined);
}

export async function runPgRestore(databaseUrl: string, inputFile: string) {
  const resolved = await resolvePgTool("pg_restore");
  const { database, user } = parseDatabaseIdentity(databaseUrl);

  if (resolved.mode === "native") {
    await runProcess(resolved.command, [
      "--clean",
      "--if-exists",
      "--no-owner",
      "--no-privileges",
      "--single-transaction",
      `--dbname=${databaseUrl}`,
      inputFile,
    ]);
    return;
  }

  const remotePath = `/tmp/adisyon-restore-${Date.now()}.dump`;
  await runProcess("docker", ["cp", inputFile, `${resolved.container}:${remotePath}`]);
  await runProcess("docker", [
    "exec",
    resolved.container!,
    "pg_restore",
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-privileges",
    "--single-transaction",
    "-U",
    user,
    "-d",
    database,
    remotePath,
  ]);
  await runProcess("docker", ["exec", resolved.container!, "rm", "-f", remotePath]).catch(() => undefined);
}
