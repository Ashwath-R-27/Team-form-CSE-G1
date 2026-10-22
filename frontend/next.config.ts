import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.7:3000", "192.168.1.7", "*.192.168.1.7"],
};

export default nextConfig;
