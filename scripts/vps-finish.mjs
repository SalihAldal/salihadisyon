#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "ssh2";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const password = process.env.VPS_PASSWORD ?? "";
if (!password) {
  console.error("VPS_PASSWORD required");
  process.exit(1);
}

const remoteCmd = `
pm2 delete adisyon-api 2>/dev/null || true
pm2 start /var/www/adisyon/infra/vps/ecosystem.config.cjs --only adisyon-api
pm2 save
sleep 5
pm2 list
curl -s -o /dev/null -w "admin:%{http_code}\\n" http://127.0.0.1:3000/adisyon/admin/login
curl -s -o /dev/null -w "api:%{http_code}\\n" http://127.0.0.1:4100/api/v1/health
curl -s http://127.0.0.1:4100/api/v1/health | head -c 200; echo
curl -s -o /dev/null -w "api-nginx:%{http_code}\\n" http://127.0.0.1/adisyon/api/v1/health
curl -s -o /dev/null -w "pos:%{http_code}\\n" http://127.0.0.1/adisyon/pos/
curl -s -o /dev/null -w "root:%{http_code}\\n" http://127.0.0.1/
`;

const eco = readFileSync(join(ROOT, "infra/vps/ecosystem.config.cjs"), "utf8");

const conn = new Client();
conn
  .on("ready", () => {
    conn.sftp((err, sftp) => {
      if (err) throw err;
      const ws = sftp.createWriteStream("/var/www/adisyon/infra/vps/ecosystem.config.cjs");
      ws.on("close", () => {
        conn.exec(remoteCmd, (e, stream) => {
          stream.on("close", (code) => {
            conn.end();
            process.exit(code ?? 0);
          });
          stream.on("data", (d) => process.stdout.write(d));
          stream.stderr.on("data", (d) => process.stderr.write(d));
        });
      });
      ws.end(eco);
    });
  })
  .on("error", (e) => {
    console.error(e.message);
    process.exit(1);
  })
  .connect({ host: "91.108.120.203", username: "root", password });
