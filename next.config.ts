import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Pin the workspace root (another lockfile exists higher up the directory tree).
  turbopack: { root: __dirname },
}

export default nextConfig
