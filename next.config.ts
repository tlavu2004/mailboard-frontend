import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // Turbopack config for Next.js 16
  turbopack: {},
};

export default nextConfig;
