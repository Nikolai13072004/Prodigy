import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    proxyClientMaxBodySize: "2gb",
    serverActions: {
      bodySizeLimit: "2gb",
    },
  },
};

export default nextConfig;
