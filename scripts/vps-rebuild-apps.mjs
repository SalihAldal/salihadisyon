#!/usr/bin/env node
/**
 * Upload fixed app files + rebuild admin/pos on VPS
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "ssh2";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const password = process.env.VPS_PASSWORD ?? "";
if (!password) {
  console.error("VPS_PASSWORD required");
  process.exit(1);
}

const FILES = [
  "pnpm-lock.yaml",
  "apps/admin-web/package.json",
  "apps/admin-web/lib/api/client.ts",
  "apps/admin-web/lib/auth/session.ts",
  "apps/admin-web/app/styles.css",
  "apps/admin-web/components/admin-shell.tsx",
  "apps/admin-web/components/ui/admin-icons.tsx",
  "apps/admin-web/components/print-integrations/print-integrations-screen.tsx",
  "apps/admin-web/components/pos-settings/pos-settings-screen.tsx",
  "apps/admin-web/components/staff/staff-screen.tsx",
  "apps/admin-web/components/staff/waiter-activity-screen.tsx",
  "apps/admin-web/components/iam/iam-roles-screen.tsx",
  "apps/admin-web/components/revenue/revenue-overview-screen.tsx",
  "apps/admin-web/components/revenue/branch-revenue-screen.tsx",
  "apps/admin-web/components/revenue/revenue-filter-form.tsx",
  "apps/admin-web/components/monitoring/monitoring-screen.tsx",
  "apps/admin-web/components/audit/audit-log-screen.tsx",
  "apps/admin-web/components/dashboard/dashboard-screen.tsx",
  "apps/admin-web/components/dashboard/dashboard-filter-form.tsx",
  "apps/admin-web/components/auth/route-permission-guard.tsx",
  "apps/admin-web/components/platform/integrations-screen.tsx",
  "apps/admin-web/components/platform/support-screen.tsx",
  "apps/admin-web/components/platform/subscription-screen.tsx",
  "apps/admin-web/components/platform/product-ratings-screen.tsx",
  "apps/admin-web/components/platform/staff-discounts-screen.tsx",
  "apps/admin-web/components/feature-flags/feature-flags-screen.tsx",
  "apps/admin-web/components/backup/backup-screen.tsx",
  "apps/admin-web/components/accounting/accounting-screen.tsx",
  "apps/admin-web/components/inventory/inventory-screen.tsx",
  "apps/admin-web/components/reports/report-screen.tsx",
  "apps/admin-web/components/reports/cancel-list-screen.tsx",
  "apps/admin-web/components/reports/category-revenue-screen.tsx",
  "apps/admin-web/components/attendance/attendance-qr-screen.tsx",
  "apps/admin-web/components/staff/employee-editor/employee-edit-modal.tsx",
  "apps/admin-web/components/staff/employee-editor/payments-tab.tsx",
  "apps/admin-web/components/staff/employee-editor/shifts-tab.tsx",
  "apps/pos-web/src/api.ts",
  "apps/pos-web/src/App.tsx",
  "apps/pos-web/src/components/pos-auth.tsx",
  "apps/pos-web/src/styles.css",
  "apps/pos-web/index.html",
  "apps/admin-web/next.config.mjs",
  "apps/admin-web/app/layout.tsx",
  "apps/admin-web/app/login/page.tsx",
  "infra/vps/nginx-adisyon.conf",
  "infra/vps/ecosystem.config.cjs",
];

function uploadFile(sftp, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    const content = readFileSync(localPath);
    const dir = remotePath.replace(/\/[^/]+$/, "");
    sftp.mkdir(dir, () => {
      const ws = sftp.createWriteStream(remotePath);
      ws.on("close", resolve);
      ws.on("error", reject);
      ws.end(content);
    });
  });
}

const rebuildCmd = `
set -e
cp /var/www/adisyon/infra/vps/nginx-adisyon.conf /etc/nginx/snippets/adisyon.conf
nginx -t && systemctl reload nginx
cd /var/www/adisyon
cat > apps/pos-web/.env.production <<'EOF'
VITE_BASE_PATH=/adisyon/pos/
VITE_API_URL=/adisyon/api/v1
VITE_SOCKET_PATH=/adisyon/ws/socket.io
EOF
export NEXT_PUBLIC_BASE_PATH=/adisyon/admin
export NEXT_PUBLIC_API_URL=/adisyon/admin/backend/v1
export NEXT_PUBLIC_SOCKET_URL=/adisyon/ws/pos
export VITE_BASE_PATH=/adisyon/pos/
export VITE_API_URL=/adisyon/api/v1
export VITE_SOCKET_PATH=/adisyon/ws/socket.io
pnpm build
pm2 restart adisyon-admin adisyon-api
pm2 save
echo "=== VERIFY ==="
# Admin restart sonrası kısa bekle (ilk saniyelerde 502 görülebiliyor)
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  code="$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/adisyon/admin/login || true)"
  if [ "$code" = "200" ] || [ "$code" = "302" ]; then
    break
  fi
  sleep 1
done

curl -s -o /dev/null -w "admin-login:%{http_code} " http://127.0.0.1/adisyon/admin/login
curl -s -o /dev/null -w "pos:%{http_code} " http://127.0.0.1/adisyon/pos/

# API restart sonrası Nginx upstream hazır olana kadar kısa bekle (502/000 spam'i önlemek için)
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  code="$(curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:4100/api/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"__smoke__","password":"__smoke__","deviceLabel":"smoke"}' || true)"
  if [ "$code" != "000" ] && [ -n "$code" ]; then
    break
  fi
  sleep 1
done

curl -s -o /dev/null -w "api-direct:%{http_code} " -X POST http://127.0.0.1:4100/api/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"__smoke__","password":"__smoke__","deviceLabel":"smoke"}'
curl -s -o /dev/null -w "api:%{http_code} " -X POST http://127.0.0.1/adisyon/api/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"__smoke__","password":"__smoke__","deviceLabel":"smoke"}'
curl -s -o /dev/null -w "api2:%{http_code}\n" -X POST http://127.0.0.1/api/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"__smoke__","password":"__smoke__","deviceLabel":"smoke"}'
`;

const conn = new Client();
conn.on("ready", () => {
  conn.sftp(async (err, sftp) => {
    if (err) throw err;
    try {
      for (const rel of FILES) {
        const local = join(ROOT, rel);
        const remote = `/var/www/adisyon/${rel.replace(/\\/g, "/")}`;
        await uploadFile(sftp, local, remote);
        console.log("uploaded", rel);
      }
      conn.exec(rebuildCmd, (e, stream) => {
        stream.on("close", (code) => {
          conn.end();
          process.exit(code ?? 0);
        });
        stream.on("data", (d) => process.stdout.write(d));
        stream.stderr.on("data", (d) => process.stderr.write(d));
      });
    } catch (e) {
      console.error(e);
      conn.end();
      process.exit(1);
    }
  });
}).connect({ host: "91.108.120.203", username: "root", password });
