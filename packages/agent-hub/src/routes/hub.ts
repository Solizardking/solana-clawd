import { Router, type Router as ExpressRouter } from "express";
import { AgentIndex } from "@openclawdsolana/agent-registry/indexer";

export function hubRoutes(): ExpressRouter {
  const router = Router();

  // GET /api/v1/hub/status
  router.get("/status", (_req, res) => {
    const idx = new AgentIndex();
    const stats = idx.stats();
    idx.close();
    res.json({
      ok: true,
      version: "0.1.0",
      name: "Solana Clawd Agent Hub",
      uptime: process.uptime(),
      stats,
    });
  });

  return router;
}
