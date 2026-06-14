import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import themePlugin from "@replit/vite-plugin-shadcn-theme-json";
import path, { dirname } from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { fileURLToPath } from "url";
import { nodePolyfills } from "vite-plugin-node-polyfills";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  plugins: [
    nodePolyfills({
      include: ["buffer", "process", "util", "stream"],
      globals: { Buffer: true, global: true, process: true },
    }),
    react(),
    runtimeErrorOverlay(),
    themePlugin(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  root: path.resolve(__dirname, "client"),
  envDir: __dirname,
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          if (id.includes("html2canvas")) return "html2canvas";
          if (
            id.includes("@solana/") ||
            id.includes("@coral-xyz/") ||
            id.includes("@project-serum/anchor") ||
            id.includes("@streamflow/") ||
            id.includes("@pump-fun/") ||
            id.includes("pumpdotfun-sdk") ||
            id.includes("@meteora-ag/") ||
            id.includes("@ellipsis-labs/") ||
            id.includes("bs58")
          ) {
            return "solana-vendor";
          }
          if (id.includes("@mui/") || id.includes("@emotion/")) {
            return "mui-vendor";
          }
          if (id.includes("framer-motion")) {
            return "motion-vendor";
          }
          if (id.includes("livekit")) {
            return "livekit-vendor";
          }
          if (
            id.includes("chart.js") ||
            id.includes("react-chartjs-2") ||
            id.includes("recharts") ||
            id.includes("@mui/x-charts")
          ) {
            return "charts-vendor";
          }
          if (id.includes("@radix-ui/") || id.includes("vaul") || id.includes("cmdk")) {
            return "ui-vendor";
          }
          if (id.includes("@tanstack/react-query") || id.includes("wouter")) {
            return "app-vendor";
          }
          if (
            id.includes("react/") ||
            id.includes("react-dom/") ||
            id.includes("scheduler")
          ) {
            return "react-vendor";
          }
        },
      },
    },
  },
});
