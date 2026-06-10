import express, { type Express } from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { agentRoutes } from "../routes/agents.js";
import { hubRoutes } from "../routes/hub.js";
import { spawnRoutes } from "../routes/spawn.js";
import { resolveWorkspaceRoot } from "../lib/workspace.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "..", "public");
const RUNTIME_WEB_DIR = join(resolveWorkspaceRoot(), "dist-web");

export function createApp(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // API routes
  app.use("/api/v1/agents", agentRoutes());
  app.use("/api/v1/hub", hubRoutes());
  app.use("/api/v1/spawn", spawnRoutes());

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", version: "0.1.0", name: "spawn-by-solana-clawd" });
  });

  app.use("/runtime", express.static(RUNTIME_WEB_DIR));

  // Dashboard
  app.use(express.static(PUBLIC_DIR));
  app.get("*", (_req, res) => {
    res.sendFile(join(PUBLIC_DIR, "index.html"));
  });

  return app;
}
