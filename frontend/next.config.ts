import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { NextConfig } from "next";

const __dirname = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: join(__dirname),
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
};

export default nextConfig;
