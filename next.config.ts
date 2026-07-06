import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  experimental: {
    staticGenerationRetryCount: 1,
    serverActions: {
      bodySizeLimit: "10gb",
    },
  },
  // Security headers applied to all responses
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Allow inline styles + style attributes (shadcn/ui, Tailwind, recharts)
              "style-src 'self' 'unsafe-inline'",
              // Allow inline scripts (Next.js hydration, inline scripts)
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              // Allow images from self, data URIs (thumbnails), and Google's servers (YouTube thumbnails)
              "img-src 'self' data: https: blob:",
              // Allow font from self and data
              "font-src 'self' data:",
              // Allow connections to self (same-origin API + WebSocket)
              // Also allow ws/wss to self for Socket.io realtime
              "connect-src 'self' ws: wss:",
              // Allow media from self (video preview if needed)
              "media-src 'self' blob:",
              // Allow form actions to self only
              "form-action 'self'",
              // Allow base-uri to self
              "base-uri 'self'",
              // Disallow object/embed/plugins
              "object-src 'none'",
              // Disallow framing (clickjacking protection)
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
