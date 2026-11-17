import type { NextConfig } from "next";

// In docker the browser talks to nginx, which routes /api to the backend.
// For `npm run dev` without nginx set DEV_API_PROXY=http://localhost:8000.
const devProxy = process.env.DEV_API_PROXY;

const nextConfig: NextConfig = {
  output: "standalone",
  cacheComponents: true,
  // the catalog is client-driven; partial prefetching adds nothing here but strict dev checks
  partialPrefetching: false,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return devProxy ? [{ source: "/api/:path*", destination: `${devProxy}/api/:path*` }] : [];
  },
};

export default nextConfig;
