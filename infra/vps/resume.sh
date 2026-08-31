#!/usr/bin/env bash
# Resume deploy after partial failure
set -euo pipefail
APP_DIR="/var/www/adisyon"
cd "$APP_DIR"

cat > apps/api/.env <<'ENVEOF'
NODE_ENV=production
APP_ENV=production
PORT=4100
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/adisyon?schema=public
REDIS_URL=redis://127.0.0.1:6380
JWT_ACCESS_SECRET=govion-adisyon-access-secret-32chars-min
JWT_REFRESH_SECRET=govion-adisyon-refresh-secret-32chars-min
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
AUTH_LOGIN_RATE_LIMIT_ENABLED=true
PG_DOCKER_CONTAINER=adisyon-postgres
PG_DOCKER_ENABLED=true
DATABASE_CONNECTION_LIMIT=10
DATABASE_POOL_TIMEOUT=10
ENVEOF

docker compose -f infra/docker/docker-compose.yml up -d
sleep 10

pnpm --filter api prisma:migrate:deploy
# Demo seed production'da kapali; ilk kullaniciyi manuel veya ayri script ile olusturun.

export NEXT_PUBLIC_BASE_PATH=/adisyon/admin
export NEXT_PUBLIC_API_URL=/adisyon/api/v1
export NEXT_PUBLIC_SOCKET_URL=/adisyon/ws/pos
export VITE_BASE_PATH=/adisyon/pos/
export VITE_API_URL=/adisyon/api/v1
export VITE_SOCKET_URL=/adisyon/ws/pos
pnpm build

pm2 delete adisyon-api 2>/dev/null || true
pm2 delete adisyon-admin 2>/dev/null || true
pm2 start infra/vps/ecosystem.config.cjs
pm2 save

cp infra/vps/nginx-adisyon.conf /etc/nginx/snippets/adisyon.conf
GOOVION_CFG="/etc/nginx/sites-available/goovion"
if ! grep -q "snippets/adisyon.conf" "$GOOVION_CFG"; then
  sed -i '/server_name govion.com.tr/a \    include /etc/nginx/snippets/adisyon.conf;' "$GOOVION_CFG"
fi
nginx -t && systemctl reload nginx

echo "OK: http://91.108.120.203/adisyon/admin"
echo "OK: http://91.108.120.203/adisyon/pos/"
