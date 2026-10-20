import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // E2E tests use their own build folder, so they can run next to `npm run dev`
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
