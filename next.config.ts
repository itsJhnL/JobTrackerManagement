import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every route in this app reads the Supabase session cookie, so the
  // static-shell model (cacheComponents) adds Suspense requirements without
  // a payoff. Classic dynamic rendering is used instead. See Memory.md.
  cacheComponents: false,
  experimental: {
    // Keep visited dynamic pages in the client router cache so navigating
    // back to a section shows the last data instantly instead of a skeleton.
    // Mutations call revalidatePath()/router.refresh(), which invalidates it.
    staleTimes: {
      dynamic: 60,
      static: 300,
    },
  },
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
  async headers() {
    return [
      {
        // Never let a browser or proxy cache authenticated pages or API responses.
        source: "/((?!_next/static|_next/image|favicon.ico).*)",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
    ];
  },
};

export default nextConfig;
