import { Router, type Router as ExpressRouter } from "express";
import { AgentIndex } from "@openclawdsolana/agent-registry/indexer";
import { loadAgentTemplates, loadCharacters } from "../lib/catalog.js";
import { listSpawnRecords } from "../lib/spawn-store.js";

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
      name: "Spawn by Solana Clawd",
      uptime: process.uptime(),
      stats,
      spawn: {
        templates: loadAgentTemplates().length,
        characters: loadCharacters().length,
        jobs: listSpawnRecords().length,
      },
    });
  });

  return router;
}
