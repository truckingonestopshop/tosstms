import type { NextConfig } from "next";
import pkg from "./package.json";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Server-only packages used by the rate con reader.
  serverExternalPackages: ["unpdf"],
  poweredByHeader: false,
  // Shown at the bottom of the menu: the app version and when this build was made.
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_BUILT_AT: new Date().toISOString(),
  },
};

export default nextConfig;
