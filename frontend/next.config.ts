import type { NextConfig } from "next";

// Backend base URL. In production set NEXT_PUBLIC_API_URL to the backend's
// public URL (e.g. https://my-backend.up.railway.app). Falls back to local dev.
// A value without a scheme is normalized to https:// so the rewrite stays valid.
const rawBackend = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const backendUrl = /^https?:\/\//.test(rawBackend) ? rawBackend : `https://${rawBackend}`;

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
