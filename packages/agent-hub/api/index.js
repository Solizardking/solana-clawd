import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { SPAWN_PLAYBOOKS } from "../dist/lib/playbooks.js";
import { loadRepoModules } from "../dist/lib/modules.js";

const snapshotUrl = new URL("../public/data/spawn-snapshot.json", import.meta.url);
const jobs = [];

function readSnapshot() {
  return JSON.parse(readFileSync(snapshotUrl, "utf8"));
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function walletAddress(seed) {
  return `spawn_${createHash("sha256").update(seed).digest("hex").slice(0, 32)}`;
}

function categoriesFor(templates) {
  return templates.reduce((acc, template) => {
    acc[template.category] = (acc[template.category] ?? 0) + 1;
    return acc;
  }, {});
}

function createJob(body, snapshot) {
  const template = snapshot.templates.find((entry) => entry.id === body.templateId);
  const character = snapshot.characters.find((entry) => entry.id === body.characterId);
  if (!template || !character) {
    return null;
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  return {
    id,
    slug: slugify(body.name || `${character.name}-${template.name}`),
    status: body.runtime === "box" ? "queued" : "provisioned",
    createdAt: now,
    updatedAt: now,
    name: String(body.name || "spawn-job"),
    templateId: template.id,
    characterId: character.id,
    network: body.network === "solana-devnet" ? "solana-devnet" : "solana-mainnet",
    walletMode: body.walletMode === "ephemeral" ? "ephemeral" : "vault",
    runtime: body.runtime === "box" || body.runtime === "cloudflare" ? body.runtime : "agentwallet",
    budgetUsd: typeof body.budgetUsd === "number" ? body.budgetUsd : Number(body.budgetUsd ?? 250),
    mission: String(body.mission || "Bootstrap a new Solana Clawd agent."),
    tags: [...new Set([...(template.tags ?? []), ...(character.topics ?? []).slice(0, 3)])],
    walletAddress: walletAddress(`${id}:${body.name}:${character.id}`),
    walletEndpoint: body.walletMode === "vault" ? character.walletEndpoint : undefined,
    rpcUrl: typeof body.rpcUrl === "string" ? body.rpcUrl : undefined,
    heliusDasUrl: typeof body.heliusDasUrl === "string" ? body.heliusDasUrl : undefined,
  };
}

export default async function handler(req, res) {
  const url = new URL(req.url ?? "/", "https://spawn.x402.wtf");
  const path = url.pathname;
  const snapshot = readSnapshot();

  if (req.method === "GET" && path.endsWith("/v1/spawn/catalog")) {
    sendJson(res, 200, {
      ok: true,
      templates: snapshot.templates,
      characters: snapshot.characters,
      spawns: jobs,
      playbooks: SPAWN_PLAYBOOKS,
      modules: loadRepoModules(),
      stats: {
        templates: snapshot.templates.length,
        characters: snapshot.characters.length,
        spawns: jobs.length,
        categories: categoriesFor(snapshot.templates),
      },
    });
    return;
  }

  if (req.method === "GET" && path.endsWith("/v1/spawn/templates")) {
    sendJson(res, 200, { ok: true, templates: snapshot.templates });
    return;
  }

  if (req.method === "GET" && path.endsWith("/v1/spawn/characters")) {
    sendJson(res, 200, { ok: true, characters: snapshot.characters });
    return;
  }

  if (req.method === "GET" && path.endsWith("/v1/spawn/jobs")) {
    sendJson(res, 200, { ok: true, jobs });
    return;
  }

  if (req.method === "GET" && path.endsWith("/v1/spawn/playbooks")) {
    sendJson(res, 200, { ok: true, playbooks: SPAWN_PLAYBOOKS });
    return;
  }

  if (req.method === "GET" && path.endsWith("/v1/spawn/modules")) {
    sendJson(res, 200, { ok: true, modules: loadRepoModules() });
    return;
  }

  if (req.method === "GET" && path.endsWith("/v1/spawn/wallet-config")) {
    const rpcUrl = process.env.SOLANA_RPC_URL ?? process.env.RPC_URL ?? "https://api.mainnet-beta.solana.com";
    const heliusApiKey = process.env.HELIUS_API_KEY ?? "";
    sendJson(res, 200, {
      ok: true,
      wallet: {
        defaultNetwork: "solana-mainnet",
        rpcUrl,
        heliusDasUrl: heliusApiKey
          ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`
          : "https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_API_KEY",
        supportsVaultMode: true,
        supportsEphemeralMode: true,
      },
    });
    return;
  }

  if (req.method === "POST" && path.endsWith("/v1/spawn/jobs")) {
    try {
      const body = await readBody(req);
      if (!body.name || !body.templateId || !body.characterId || !body.mission) {
        sendJson(res, 400, { ok: false, error: "name, templateId, characterId, and mission are required" });
        return;
      }
      const job = createJob(body, snapshot);
      if (!job) {
        sendJson(res, 404, { ok: false, error: "template or character not found" });
        return;
      }
      jobs.unshift(job);
      sendJson(res, 201, { ok: true, job });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : "invalid request body" });
    }
    return;
  }

  sendJson(res, 404, { ok: false, error: "not found" });
}
