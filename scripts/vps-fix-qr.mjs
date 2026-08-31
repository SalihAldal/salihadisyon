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

const goovionConf = readFileSync(join(ROOT, "infra/vps/nginx-goovion.conf"), "utf8");
const adisyonConf = readFileSync(join(ROOT, "infra/vps/nginx-adisyon.conf"), "utf8");

const remoteCmd = `
set -e
cp /etc/nginx/sites-available/goovion /etc/nginx/sites-available/goovion.bak.$(date +%Y%m%d%H%M%S)
cat > /etc/nginx/sites-available/goovion << 'GOOVIONEOF'
${goovionConf}
GOOVIONEOF
cat > /etc/nginx/snippets/adisyon.conf << 'ADISYONEOF'
${adisyonConf}
ADISYONEOF
chmod -R a+rX /var/www/goovion/public/assets
nginx -t
systemctl reload nginx
echo "=== QR ==="
curl -s -o /dev/null -w "GET /: %{http_code}\\n" http://127.0.0.1/
curl -s -o /dev/null -w "GET /kategori/1: %{http_code}\\n" http://127.0.0.1/kategori/1
curl -s -o /dev/null -w "GET /admin: %{http_code}\\n" http://127.0.0.1/admin
curl -s -o /dev/null -w "GET /assets/css/app.css: %{http_code}\\n" http://127.0.0.1/assets/css/app.css
echo "=== Adisyon ==="
curl -s -o /dev/null -w "GET /adisyon/admin/login: %{http_code}\\n" http://127.0.0.1/adisyon/admin/login
curl -s -o /dev/null -w "GET /adisyon/pos/: %{http_code}\\n" http://127.0.0.1/adisyon/pos/
curl -s -o /dev/null -w "POST /adisyon/api/v1/auth/login: %{http_code}\\n" -X POST http://127.0.0.1/adisyon/api/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"x","password":"y"}'
pm2 list | grep adisyon
echo "=== DNS ==="
echo "govion.com.tr -> $(dig +short govion.com.tr A | tr '\\n' ' ')"
echo "VPS IP -> 91.108.120.203"
`;

const conn = new Client();
conn
  .on("ready", () => {
    conn.exec(remoteCmd, (err, stream) => {
      stream.on("close", (code) => {
        conn.end();
        process.exit(code ?? 0);
      });
      stream.on("data", (d) => process.stdout.write(d));
      stream.stderr.on("data", (d) => process.stderr.write(d));
    });
  })
  .on("error", (e) => {
    console.error(e.message);
    process.exit(1);
  })
  .connect({ host: "91.108.120.203", username: "root", password });
