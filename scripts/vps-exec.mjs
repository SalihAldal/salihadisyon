#!/usr/bin/env node
import { Client } from "ssh2";

const host = process.env.VPS_HOST ?? "91.108.120.203";
const user = process.env.VPS_USER ?? "root";
const password = process.env.VPS_PASSWORD ?? "";
const cmd = process.argv.slice(2).join(" ");

if (!password || !cmd) {
  console.error("Usage: VPS_PASSWORD=... node scripts/vps-exec.mjs <command>");
  process.exit(1);
}

const conn = new Client();
conn
  .on("ready", () => {
    conn.exec(cmd, (err, stream) => {
      if (err) {
        console.error(err.message);
        conn.end();
        process.exit(1);
      }
      stream
        .on("close", (code) => {
          conn.end();
          process.exit(code ?? 0);
        })
        .on("data", (d) => process.stdout.write(d))
        .stderr.on("data", (d) => process.stderr.write(d));
    });
  })
  .on("error", (err) => {
    console.error(err.message);
    process.exit(1);
  })
  .connect({ host, port: 22, username: user, password, readyTimeout: 20000 });
