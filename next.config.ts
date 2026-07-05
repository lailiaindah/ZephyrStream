import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Skip prerendering for pages that use browser-only APIs (socket.io, etc.)
  // This fixes the "null is not an object (evaluating 'R.H.useContext')" error
  // during build when trying to prerender the global-error page.
  experimental: {
    // Allow pages to be dynamic by default
    staticGenerationRetryCount: 1,
  },
};

export default nextConfig;
