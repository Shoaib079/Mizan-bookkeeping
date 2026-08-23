import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { NextConfig } from "next";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = join(__dirname);

/** Comma-separated host[:port] list from frontend/.env.local (phone sandbox). */
const sandboxDevOrigins = (process.env.SANDBOX_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: appRoot,
  // Dev-only: phone/tablet on LAN (set SANDBOX_DEV_ORIGINS in .env.local).
  ...(sandboxDevOrigins.length > 0
    ? { allowedDevOrigins: sandboxDevOrigins }
    : {}),
  // Reduce parallel static generation — avoids ENFILE on macOS with low maxfiles.
  experimental: {
    cpus: 1,
    workerThreads: false,
  },
  turbopack: {
    root: appRoot,
  },
  async redirects() {
    return [
      {
        source: "/setup/backups",
        destination: "/settings/restaurant",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    // Same-origin proxy for local/dev — browsers often block or flake on
    // cross-origin fetch to :8000 (CORS / local-network permission).
    const api =
      process.env.MIZAN_API_PROXY_TARGET?.replace(/\/$/, "") ||
      "http://127.0.0.1:8000";
    return [
      {
        source: "/backend-api/:path*",
        destination: `${api}/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
      {
        source: "/_next/static/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
