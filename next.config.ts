import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  webpack: (config) => {
    // 屏蔽 node 原生模块，解决 ExcelJS 在浏览器端打包报错
    config.resolve.alias = {
      ...config.resolve.alias,
      fs: false,
      path: false,
      stream: false,
      constants: false,
    };
    return config;
  },
};

export default nextConfig;
