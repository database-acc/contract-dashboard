import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    agentFeedback: true,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      fs: false,
      path: false,
      stream: false,
      constants: false,
      crypto: false,
      zlib: false,
      buffer: false,
    };
    return config;
  },
};

export default nextConfig;
