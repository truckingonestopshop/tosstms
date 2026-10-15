import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Server-only packages used by the rate con reader.
  serverExternalPackages: ["unpdf"],
  poweredByHeader: false,
};

export default nextConfig;
