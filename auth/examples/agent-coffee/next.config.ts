import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
  allowedDevOrigins: ["agent-coffee.localhost", "*.agent-coffee.localhost"],
};

export default nextConfig;
