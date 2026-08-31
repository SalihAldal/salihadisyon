#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/adisyon"
REPO_URL="${REPO_URL:-https://github.com/SalihAldal/salihadisyon.git}"
BRANCH="${BRANCH:-main}"

echo "==> Adisyon VPS bootstrap"

export DEBIAN_FRONTEND=noninteractive

if ! command -v node >/dev/null 2>&1; then
  echo "==> Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "==> Installing pnpm..."
  npm install -g pnpm@10
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "==> Installing PM2..."
  npm install -g pm2
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
fi

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  apt-get install -y docker-compose-plugin || true
fi

mkdir -p /var/www
if [ -d /tmp/adisyon-overlay/apps/api ]; then
  echo "==> Deploying from uploaded overlay..."
  rm -rf "$APP_DIR"
  mkdir -p "$APP_DIR"
  cp -a /tmp/adisyon-overlay/. "$APP_DIR/"
elif [ ! -d "$APP_DIR/.git" ]; then
  echo "==> Cloning repository..."
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
else
  echo "==> Pulling latest..."
  cd "$APP_DIR"
  git fetch origin "$BRANCH"
  git reset --hard "origin/$BRANCH"
fi

cd "$APP_DIR"

if [ -d /tmp/adisyon-overlay ] && [ -d "$APP_DIR/.git" ]; then
  echo "==> Applying local overlay patches..."
  cp -a /tmp/adisyon-overlay/. "$APP_DIR/"
fi

echo "==> Writing production env files..."
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

cat > apps/admin-web/.env.production.local <<'ENVEOF'
NEXT_PUBLIC_BASE_PATH=/adisyon/admin
NEXT_PUBLIC_API_URL=/adisyon/api/v1
NEXT_PUBLIC_SOCKET_URL=/adisyon/ws/pos
NEXT_PUBLIC_APP_NAME=Adisyon SaaS
ENVEOF

cat > apps/pos-web/.env.production <<'ENVEOF'
VITE_BASE_PATH=/adisyon/pos/
VITE_API_URL=/adisyon/api/v1
VITE_SOCKET_PATH=/adisyon/ws/socket.io
ENVEOF

echo "==> Starting PostgreSQL + Redis..."
docker compose -f infra/docker/docker-compose.yml up -d
sleep 8

echo "==> Installing dependencies..."
pnpm install --frozen-lockfile || pnpm install

echo "==> Generating Prisma client..."
pnpm prisma:generate

echo "==> Running migrations..."
pnpm --filter api prisma:migrate:deploy || pnpm --filter api prisma:migrate

echo "==> Building apps..."
export NEXT_PUBLIC_BASE_PATH=/adisyon/admin
export NEXT_PUBLIC_API_URL=/adisyon/api/v1
export NEXT_PUBLIC_SOCKET_URL=/adisyon/ws/pos
export VITE_BASE_PATH=/adisyon/pos/
export VITE_API_URL=/adisyon/api/v1
export VITE_SOCKET_PATH=/adisyon/ws/socket.io
pnpm build

echo "==> Seed (ignore if already seeded)..."
pnpm prisma:seed || true

echo "==> PM2 processes..."
pm2 delete adisyon-api 2>/dev/null || true
pm2 delete adisyon-admin 2>/dev/null || true
pm2 start infra/vps/ecosystem.config.cjs
pm2 save
pm2 startup systemd -u root --hp /root || true

echo "==> Nginx snippet..."
mkdir -p /etc/nginx/snippets
cp infra/vps/nginx-adisyon.conf /etc/nginx/snippets/adisyon.conf

GOOVION_CFG="/etc/nginx/sites-available/goovion"
if ! grep -q "snippets/adisyon.conf" "$GOOVION_CFG"; then
  sed -i '/server_name govion.com.tr/a \    include /etc/nginx/snippets/adisyon.conf;' "$GOOVION_CFG"
fi

nginx -t
systemctl reload nginx

echo "==> DONE"
echo "Admin: http://91.108.120.203/adisyon/admin"
echo "POS:   http://91.108.120.203/adisyon/pos/"
echo "API:   http://91.108.120.203/adisyon/api/v1"
echo "QR menu (goovion root) unchanged at /"
