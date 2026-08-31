#!/usr/bin/env node
/**
 * Upload project overlay + bootstrap to VPS and run deployment.
 * Usage: VPS_PASSWORD=... node scripts/vps-deploy.mjs
 */
import { readFileSync, readdirSync, statSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "ssh2";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..");
const host = process.env.VPS_HOST ?? "91.108.120.203";
const user = process.env.VPS_USER ?? "root";
const password = process.env.VPS_PASSWORD ?? "";

const OVERLAY_FILES = [
  "apps/admin-web/next.config.mjs",
  "apps/pos-web/vite.config.ts",
  "apps/pos-web/src/api.ts",
  "infra/vps/nginx-adisyon.conf",
  "infra/vps/ecosystem.config.cjs",
  "infra/vps/bootstrap.sh",
  "infra/docker/docker-compose.yml",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "turbo.json",
  "tsconfig.base.json",
  "packages",
  "apps/api",
  "apps/admin-web",
  "apps/pos-web",
];

if (!password) {
  console.error("VPS_PASSWORD required");
  process.exit(1);
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".next", "dist", ".git", "coverage", ".turbo", "storage"].includes(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

function collectOverlayPaths() {
  const files = new Set();
  for (const rel of OVERLAY_FILES) {
    const abs = join(ROOT, rel);
    try {
      const st = statSync(abs);
      if (st.isDirectory()) {
        for (const f of walk(abs)) files.add(f);
      } else {
        files.add(abs);
      }
    } catch {
      /* skip missing */
    }
  }
  return [...files];
}

function exec(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = "";
      stream
        .on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`exit ${code}`))))
        .on("data", (d) => {
          process.stdout.write(d);
          out += d;
        })
        .stderr.on("data", (d) => {
          process.stderr.write(d);
          out += d;
        });
    });
  });
}

function mkdirRemote(sftp, dir) {
  return new Promise((resolve, reject) => {
    sftp.mkdir(dir, (err) => {
      if (!err) return resolve();
      if (err.code === 4) return resolve();
      reject(err);
    });
  });
}

async function ensureRemoteDir(sftp, dir) {
  const parts = dir.split("/").filter(Boolean);
  let cur = "";
  for (const part of parts) {
    cur += `/${part}`;
    await mkdirRemote(sftp, cur).catch(() => {});
  }
}

async function uploadFile(sftp, localPath, remotePath) {
  const content = readFileSync(localPath);
  const remoteDir = remotePath.replace(/\/[^/]+$/, "");
  await ensureRemoteDir(sftp, remoteDir);
  return new Promise((resolve, reject) => {
    const ws = sftp.createWriteStream(remotePath);
    ws.on("close", resolve);
    ws.on("error", reject);
    ws.end(content);
  });
}

const conn = new Client();
conn
  .on("ready", async () => {
    try {
      await exec(conn, "rm -rf /tmp/adisyon-overlay && mkdir -p /tmp/adisyon-overlay");
      const files = collectOverlayPaths();
      console.log(`Uploading ${files.length} files to VPS overlay...`);
      await new Promise((resolve, reject) => {
        conn.sftp(async (err, sftp) => {
          if (err) return reject(err);
          try {
            let n = 0;
            for (const localPath of files) {
              const rel = relative(ROOT, localPath).replace(/\\/g, "/");
              const remotePath = `/tmp/adisyon-overlay/${rel}`;
              await uploadFile(sftp, localPath, remotePath);
              n++;
              if (n % 50 === 0) process.stdout.write(`  ${n}/${files.length}\n`);
            }
            console.log(`Uploaded ${n} files.`);
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      });

      const bootstrap = readFileSync(join(ROOT, "infra/vps/bootstrap.sh"), "utf8");
      await new Promise((resolve, reject) => {
        conn.sftp((err, sftp) => {
          if (err) return reject(err);
          const ws = sftp.createWriteStream("/tmp/adisyon-bootstrap.sh", { mode: 0o755 });
          ws.on("close", resolve);
          ws.on("error", reject);
          ws.end(bootstrap);
        });
      });

      console.log("\nRunning deployment (10-20 min)...\n");
      await exec(conn, "bash /tmp/adisyon-bootstrap.sh 2>&1");
      conn.end();
    } catch (e) {
      console.error("\nDeploy failed:", e.message);
      conn.end();
      process.exit(1);
    }
  })
  .on("error", (e) => {
    console.error(e.message);
    process.exit(1);
  })
  .connect({ host, port: 22, username: user, password, readyTimeout: 30000 });
