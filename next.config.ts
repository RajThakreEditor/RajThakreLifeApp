import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Keep Turbopack within this app when a parent directory has another lockfile.
    root: __dirname,
  },
};

export default nextConfig;
