import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Isolate this app from the existing .next artifacts in this folder.
  distDir: ".next-lifeos",
  turbopack: {
    // Keep Turbopack within this app when a parent directory has another lockfile.
    root: __dirname,
  },
};

export default nextConfig;
