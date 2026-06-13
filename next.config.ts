import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// Pin the workspace root to this project. Without this, Next infers the root
// from the nearest lockfile and can pick up a stray package-lock.json in a
// parent directory (e.g. the home folder), resolving modules from the wrong place.
const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
