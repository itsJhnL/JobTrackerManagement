import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every route in this app reads the Supabase session cookie, so the
  // static-shell model (cacheComponents) adds Suspense requirements without
  // a payoff. Classic dynamic rendering is used instead. See Memory.md.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**.supabase.co" }],
  },
};

export default nextConfig;
