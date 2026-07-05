import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  experimental: {
    staticGenerationRetryCount: 1,
  },
  // Allow large file uploads (up to 10GB per request)
  // This fixes "Server acted in an unexpected way" error when uploading videos
  bodyParser: {
    sizeLimit: "10gb",
  },
  // Also set API response size limit
  api: {
    bodyParser: {
      sizeLimit: "10gb",
    },
    responseLimit: false,
  },
};

export default nextConfig;
