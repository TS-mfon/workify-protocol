import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@workify/protocol-types", "@workify/evidence-engine"],
  experimental: { optimizePackageImports: ["lucide-react", "motion"] },
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
