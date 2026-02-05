import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  /* config options here */
  reactCompiler: true,
  reactStrictMode: false,
};

export default nextConfig;
