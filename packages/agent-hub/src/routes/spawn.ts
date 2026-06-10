import { Router, type Router as ExpressRouter } from "express";
import { loadAgentTemplates, loadCharacters } from "../lib/catalog.js";
import { createSpawnRecord, listSpawnRecords } from "../lib/spawn-store.js";

export function spawnRoutes(): ExpressRouter {
  const router = Router();

  router.get("/catalog", (_req, res) => {
    const templates = loadAgentTemplates();
    const characters = loadCharacters();
    const spawns = listSpawnRecords();

    const categories = templates.reduce<Record<string, number>>((acc, template) => {
      acc[template.category] = (acc[template.category] ?? 0) + 1;
      return acc;
    }, {});

    res.json({
      ok: true,
      templates,
      characters,
      spawns,
      stats: {
        templates: templates.length,
        characters: characters.length,
        spawns: spawns.length,
        categories,
      },
    });
  });

  router.get("/templates", (_req, res) => {
    res.json({ ok: true, templates: loadAgentTemplates() });
  });

  router.get("/characters", (_req, res) => {
    res.json({ ok: true, characters: loadCharacters() });
  });

  router.get("/jobs", (_req, res) => {
    res.json({ ok: true, jobs: listSpawnRecords() });
  });

  router.post("/jobs", (req, res) => {
    const {
      name,
      templateId,
      characterId,
      network,
      walletMode,
      runtime,
      budgetUsd,
      mission,
    } = req.body as Record<string, unknown>;

    if (!name || !templateId || !characterId || !mission) {
      return res.status(400).json({
        ok: false,
        error: "name, templateId, characterId, and mission are required",
      });
    }

    const templates = loadAgentTemplates();
    const characters = loadCharacters();
    const template = templates.find((entry) => entry.id === templateId);
    const character = characters.find((entry) => entry.id === characterId);

    if (!template || !character) {
      return res.status(404).json({ ok: false, error: "template or character not found" });
    }

    const record = createSpawnRecord({
      name: String(name),
      template,
      character,
      network: network === "solana-devnet" ? "solana-devnet" : "solana-mainnet",
      walletMode: walletMode === "ephemeral" ? "ephemeral" : "vault",
      runtime: runtime === "box" || runtime === "cloudflare" ? runtime : "agentwallet",
      budgetUsd: typeof budgetUsd === "number" ? budgetUsd : Number(budgetUsd ?? 250),
      mission: String(mission),
    });

    return res.status(201).json({ ok: true, job: record });
  });

  return router;
}
