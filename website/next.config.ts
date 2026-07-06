import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The repo root has its own package-lock.json (WhatsApp bot), so pin the
  // workspace root to this directory to stop Next.js guessing wrong.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
