import type { NextConfig } from "next";

// Backend base URL. In production set NEXT_PUBLIC_API_URL to the backend's
// public URL (e.g. https://my-backend.up.railway.app). Falls back to local dev.
const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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
