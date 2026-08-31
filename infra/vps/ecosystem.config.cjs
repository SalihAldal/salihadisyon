module.exports = {
  apps: [
    {
      name: "adisyon-api",
      cwd: "/var/www/adisyon/apps/api",
      script: "node_modules/ts-node/dist/bin.js",
      args: "-r tsconfig-paths/register dist/apps/api/src/main.js",
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        APP_ENV: "production",
        PORT: "4100",
      },
    },
    {
      name: "adisyon-admin",
      cwd: "/var/www/adisyon/apps/admin-web",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        NEXT_PUBLIC_BASE_PATH: "/adisyon/admin",
        NEXT_PUBLIC_API_URL: "/adisyon/admin/backend/v1",
        NEXT_PUBLIC_SOCKET_URL: "/adisyon/ws/pos",
      },
    },
  ],
};
