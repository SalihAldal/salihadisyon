#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "ssh2";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const password = process.env.VPS_PASSWORD ?? "";
if (!password) process.exit(1);

const goovionConf = readFileSync(join(ROOT, "infra/vps/nginx-goovion.conf"), "utf8");
const adisyonConf = readFileSync(join(ROOT, "infra/vps/nginx-adisyon.conf"), "utf8");

const remoteCmd = `
cat > /etc/nginx/snippets/adisyon.conf << 'EOF'
${adisyonConf}
EOF
cat > /etc/nginx/sites-available/goovion << 'EOF'
${goovionConf}
EOF
nginx -t && systemctl reload nginx
echo OK
`;

const conn = new Client();
conn.on("ready", () => {
  conn.exec(remoteCmd, (err, stream) => {
    stream.on("close", (code) => { conn.end(); process.exit(code ?? 0); });
    stream.on("data", (d) => process.stdout.write(d));
    stream.stderr.on("data", (d) => process.stderr.write(d));
  });
}).connect({ host: "91.108.120.203", username: "root", password });
