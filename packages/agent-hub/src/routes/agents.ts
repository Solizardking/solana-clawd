import { Router, type Router as ExpressRouter } from "express";
import { AgentIndex } from "@openclawdsolana/agent-registry/indexer";
import { fetchAgent } from "@openclawdsolana/agent-registry/registry";
import type { AgentNetwork, SearchOptions } from "@openclawdsolana/agent-registry";

export function agentRoutes(): ExpressRouter {
  const router = Router();

  // GET /api/v1/agents — search / list
  router.get("/", (req, res) => {
    try {
      const idx = new AgentIndex();
      const opts: SearchOptions = {
        query: req.query.q as string | undefined,
        network: req.query.network as AgentNetwork | undefined,
        service: req.query.service as string | undefined,
        capability: req.query.capability as string | undefined,
        active:
          req.query.active === "true"
            ? true
            : req.query.active === "false"
            ? false
            : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
      };
      const agents = idx.search(opts);
      const stats = idx.stats();
      idx.close();
      res.json({ agents, stats, ok: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message, ok: false });
    }
  });

  // GET /api/v1/agents/stats
  router.get("/stats", (_req, res) => {
    try {
      const idx = new AgentIndex();
      const stats = idx.stats();
      idx.close();
      res.json({ stats, ok: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message, ok: false });
    }
  });

  // GET /api/v1/agents/:address — get from local index or fetch on-chain
  router.get("/:address", async (req, res) => {
    try {
      const idx = new AgentIndex();
      let agent = idx.get(req.params.address);

      if (!agent) {
        // fallback: fetch live from chain
        const rpc = (req.query.rpc as string) ?? undefined;
        agent = (await fetchAgent(req.params.address, rpc)) ?? undefined;
        if (agent) {
          idx.upsert(agent);
          idx.setMeta("last_indexed", Date.now().toString());
        }
      }
      idx.close();

      if (!agent) {
        return res.status(404).json({ error: "Agent not found", ok: false });
      }
      res.json({ agent, ok: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message, ok: false });
    }
  });

  // POST /api/v1/agents/index — add an agent address to the local index
  router.post("/index", async (req, res) => {
    const { address, rpc } = req.body as { address: string; rpc?: string };
    if (!address) {
      return res.status(400).json({ error: "address required", ok: false });
    }
    try {
      const agent = await fetchAgent(address, rpc);
      if (!agent) {
        return res.status(404).json({ error: "Agent not registered on-chain", ok: false });
      }
      const idx = new AgentIndex();
      idx.upsert(agent);
      idx.setMeta("last_indexed", Date.now().toString());
      idx.close();
      res.json({ agent, ok: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message, ok: false });
    }
  });

  return router;
}
