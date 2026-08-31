/** @type {import("next").NextConfig} */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const apiProxyTarget = process.env.NEXT_PUBLIC_API_PROXY_TARGET ?? "";

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@adisyon/config", "@adisyon/types", "@adisyon/ui", "@adisyon/utils"],
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
  async rewrites() {
    if (apiProxyTarget) {
      const target = apiProxyTarget.replace(/\/$/, "");
      return [
        {
          source: "/adisyon/admin/backend/v1/:path*",
          destination: `${target}/:path*`,
        },
        {
          source: "/backend/v1/:path*",
          destination: `${target}/:path*`,
        },
      ];
    }

    if (!basePath) return [];

    return [
      {
        source: "/backend/:path*",
        destination: "http://127.0.0.1:4100/api/:path*",
      },
    ];
  },
};

export default nextConfig;
