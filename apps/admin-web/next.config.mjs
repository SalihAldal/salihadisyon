/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@adisyon/config", "@adisyon/types", "@adisyon/ui", "@adisyon/utils"],
};

export default nextConfig;
