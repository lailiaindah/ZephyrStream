import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  experimental: {
    staticGenerationRetryCount: 1,
    // Allow large file uploads via Server Actions / Route Handlers (up to 10GB)
    // In Next.js 16 the old `api.bodyParser.sizeLimit` is gone; this is the
    // supported way to raise the body size limit for App Router.
    serverActions: {
      bodySizeLimit: "10gb",
    },
  },
};

export default nextConfig;
