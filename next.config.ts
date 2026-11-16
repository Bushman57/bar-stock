  import type { NextConfig } from "next";

  const nextConfig: NextConfig = {
    allowedDevOrigins: ["192.168.146.1"],
    serverExternalPackages: ["firebase-admin", "googleapis"],
  };

  export default nextConfig;
