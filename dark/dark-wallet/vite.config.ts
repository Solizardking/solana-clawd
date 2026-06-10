import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  envPrefix: ["VITE_", "HELIUS_", "SOLANA_", "XAI_"],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@dark-agent": path.resolve(__dirname, "../dark-agent"),
      "@dark-defi": path.resolve(__dirname, "../dark-defi"),
      "@dark-swap": path.resolve(__dirname, "../dark-swap"),
      "@dark-zcash": path.resolve(__dirname, "../dark-zcash"),
      "@dark-helius": path.resolve(__dirname, "../dark-helius"),
    },
  },
  server: {
    port: 4173,
    host: "0.0.0.0",
    fs: {
      allow: [path.resolve(__dirname, "..")],
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
