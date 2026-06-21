import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "web",
  plugins: [react()],
  build: {
    outDir: "../dist/public",
    emptyOutDir: true,
  },
  server: {
    port: 5177,
    proxy: {
      "/admin": "http://127.0.0.1:8080",
      "/flow": "http://127.0.0.1:8080",
      "/health": "http://127.0.0.1:8080",
      "/mesh": "http://127.0.0.1:8080",
      "/models": "http://127.0.0.1:8080",
      "/status": "http://127.0.0.1:8080",
      "/v1": "http://127.0.0.1:8080",
    },
  },
});
