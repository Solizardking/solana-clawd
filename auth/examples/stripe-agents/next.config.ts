import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
  allowedDevOrigins: ["stripe-agents.localhost", "*.stripe-agents.localhost"],
};

export default nextConfig;
