import type { NextConfig } from "next";

// Backend base URL. In production set NEXT_PUBLIC_API_URL to the backend's
// public URL (e.g. https://my-backend.up.railway.app). Falls back to local dev.
// A value without a scheme is normalized to https:// so the rewrite stays valid.
const rawBackend = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const backendUrl = /^https?:\/\//.test(rawBackend) ? rawBackend : `https://${rawBackend}`;

const nextConfig: NextConfig = {
  // Pin the workspace root to this folder so Turbopack doesn't infer a parent
  // directory (e.g. ~/ via a stray lockfile) and try to scan the whole home dir.
  turbopack: { root: process.cwd() },
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
