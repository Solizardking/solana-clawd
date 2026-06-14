import { Router } from "express";
import { sql, eq, desc } from "drizzle-orm";
import { db } from "../db";
import { userAgents, monetizedAgents, insertUserAgentSchema } from "@shared/schema";
import { getClawdBalance } from "../lib/clawd-balance";
import { trackUsageFromRequest } from "../lib/usage";
import { agentsIndex } from "../lib/upstash-search";
import { getBrowserAgent, loadBrowserAgents } from "../lib/clawd/browserAgents";
import { deriveBrowserAgentRecommendation } from "../lib/clawd/browserAgentRecommendations";
import { resolveUserAgentImportedContext } from "../lib/clawd/userAgentImportedContext";
import { getUserAgentRuntimeProfile } from "../lib/clawd/userAgentRuntime";
import { getUserAgentRuntimeBridge } from "../lib/clawd/userAgentBridge";
import { getUserAgentAdapterStatus } from "../lib/clawd/userAgentAdapterStatus";
import { getUserAgentOperationalData } from "../lib/clawd/userAgentOperationalData";

const router = Router();

const MIN_CLAWD_TO_DEPLOY = 100_000;

let tableReady = false;
let monetizationTableReady = false;
async function ensureTable() {
  if (tableReady || !db) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_agents (
        id SERIAL PRIMARY KEY,
        "ownerWallet" VARCHAR(64) NOT NULL,
        slug VARCHAR(32) NOT NULL UNIQUE,
        name VARCHAR(64) NOT NULL,
        persona TEXT NOT NULL,
        greeting TEXT,
        provider VARCHAR(32) NOT NULL DEFAULT 'xai',
        model VARCHAR(64) NOT NULL DEFAULT 'grok-2-latest',
        "avatarUrl" TEXT,
        "sourceAgentId" VARCHAR(128),
        "launchRuntime" VARCHAR(64),
        "importedSpec" JSONB,
        status VARCHAR(16) NOT NULL DEFAULT 'active',
        "promptCount" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`ALTER TABLE user_agents ADD COLUMN IF NOT EXISTS "sourceAgentId" VARCHAR(128)`);
    await db.execute(sql`ALTER TABLE user_agents ADD COLUMN IF NOT EXISTS "launchRuntime" VARCHAR(64)`);
    await db.execute(sql`ALTER TABLE user_agents ADD COLUMN IF NOT EXISTS "importedSpec" JSONB`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS user_agents_owner_idx ON user_agents("ownerWallet")`);
    tableReady = true;
  } catch (e) {
    console.error("[user-agents] CREATE TABLE failed:", e);
  }
}

async function ensureMonetizationTable() {
  if (monetizationTableReady || !db) return;
  try {
    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE monetized_target AS ENUM ('agent', 'mcp', 'http', 'tool');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS monetized_agents (
        id SERIAL PRIMARY KEY,
        "ownerUserId" INTEGER NOT NULL,
        slug VARCHAR(96) NOT NULL UNIQUE,
        target monetized_target NOT NULL DEFAULT 'agent',
        label VARCHAR(160) NOT NULL,
        description TEXT,
        "recipientWallet" VARCHAR(64) NOT NULL,
        "agentWalletId" INTEGER,
        "agentAddress" VARCHAR(64),
        "pricePerCallAtomic" INTEGER NOT NULL DEFAULT 0,
        "commissionBps" INTEGER NOT NULL DEFAULT 1000,
        network VARCHAR(32) NOT NULL DEFAULT 'solana-mainnet',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_monetized_agents_owner ON monetized_agents ("ownerUserId")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_monetized_agents_agent_address ON monetized_agents ("agentAddress")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_monetized_agents_active ON monetized_agents (active) WHERE active = TRUE`);
    monetizationTableReady = true;
  } catch (e) {
    console.error("[user-agents] monetization schema ensure failed:", e);
  }
}

function objectValue(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function priceToAtomic(value: unknown) {
  const parsed = Number(typeof value === "string" ? value.trim() : value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 1_000_000);
}

function paidServiceSpec(importedSpec: unknown) {
  const spec = objectValue(importedSpec);
  const service = objectValue(spec?.service);
  if (!service || service.paid !== true) return null;

  return {
    visibility: stringValue(service.visibility) || "public",
    pricePerCallAtomic: priceToAtomic(service.price),
    recipientWallet: stringValue(service.recipientWallet),
    priceUnit: stringValue(service.priceUnit) || "call",
  };
}

async function getMonetizedAgent(slug: string) {
  if (!db) return null;
  await ensureMonetizationTable();
  try {
    const [row] = await db
      .select()
      .from(monetizedAgents)
      .where(eq(monetizedAgents.slug, slug))
      .limit(1);
    return row ?? null;
  } catch (e) {
    console.error("[user-agents] monetized service lookup failed:", e);
    return null;
  }
}

async function upsertMonetizedAgentForDeployment(params: {
  ownerUserId: number;
  slug: string;
  name: string;
  description: string | null;
  ownerWallet: string;
  recipientWallet: string;
  pricePerCallAtomic: number;
}) {
  if (!db) return null;
  await ensureMonetizationTable();

  const recipientWallet = params.recipientWallet || params.ownerWallet;
  const existing = await getMonetizedAgent(params.slug);
  if (existing) {
    const [updated] = await db
      .update(monetizedAgents)
      .set({
        ownerUserId: params.ownerUserId,
        label: params.name,
        description: params.description,
        recipientWallet,
        agentAddress: params.ownerWallet,
        pricePerCallAtomic: params.pricePerCallAtomic,
        commissionBps: 1000,
        network: "solana-mainnet",
        active: true,
        updatedAt: new Date(),
      })
      .where(eq(monetizedAgents.slug, params.slug))
      .returning();
    return updated ?? existing;
  }

  const [created] = await db
    .insert(monetizedAgents)
    .values({
      ownerUserId: params.ownerUserId,
      slug: params.slug,
      target: "agent",
      label: params.name,
      description: params.description,
      recipientWallet,
      agentAddress: params.ownerWallet,
      pricePerCallAtomic: params.pricePerCallAtomic,
      commissionBps: 1000,
      network: "solana-mainnet",
      active: true,
    })
    .returning();
  return created ?? null;
}

function deploymentManifest(agent: typeof userAgents.$inferSelect, monetizedService: typeof monetizedAgents.$inferSelect | null) {
  const spec = objectValue(agent.importedSpec);
  const runtimes = objectValue(spec?.runtimes);
  const cloudflare = objectValue(runtimes?.cloudflare);
  const googleAgentEngine = objectValue(runtimes?.googleAgentEngine);
  const agentAuth = objectValue(spec?.agentAuth);
  const service = objectValue(spec?.service);
  const workerRoute = stringValue(cloudflare?.workerRoute) || `/api/agents/${agent.slug}/run`;
  const registryName = stringValue(googleAgentEngine?.registryName) || agent.slug;
  const adkEntrypoint = stringValue(googleAgentEngine?.entrypoint) || "adk.agent:root_agent";

  return {
    id: agent.slug,
    name: agent.name,
    description: stringValue(service?.description) || agent.greeting || null,
    public: service?.public !== false,
    runtime: agent.launchRuntime || "hybrid",
    provider: agent.provider,
    model: agent.model,
    endpoints: {
      publicPage: `/agents/deployed/${agent.slug}`,
      run: workerRoute,
      manifest: `/api/user-agents/by-slug/${agent.slug}/deploy-manifest`,
      discovery: stringValue(agentAuth?.discovery) || "/caap/discovery",
      attestation: stringValue(agentAuth?.attestation) || "/caap/attest",
      status: stringValue(agentAuth?.status) || "/caap/status/:agentId?wallet=",
    },
    cloudflare: {
      enabled: cloudflare?.enabled === true,
      workerRoute,
      bindings: Array.isArray(cloudflare?.bindings) ? cloudflare.bindings : [],
      moduleEntrypoint: "src/agent-worker.ts",
    },
    googleAgentEngine: {
      enabled: googleAgentEngine?.enabled === true,
      registryName,
      adkEnabled: googleAgentEngine?.adkEnabled === true,
      entrypoint: adkEntrypoint,
      packageHint: "google-adk",
    },
    agentAuth: {
      enabled: agentAuth?.enabled === true,
      protocol: stringValue(agentAuth?.protocol) || "CAAP/1.0",
      identity: stringValue(agentAuth?.identity) || "SIWS",
      capabilities: Array.isArray(agentAuth?.capabilities) ? agentAuth.capabilities : [],
      gating: Array.isArray(agentAuth?.gating) ? agentAuth.gating : [],
    },
    monetization: monetizedService
      ? {
          id: monetizedService.id,
          slug: monetizedService.slug,
          target: monetizedService.target,
          recipientWallet: monetizedService.recipientWallet,
          pricePerCallAtomic: monetizedService.pricePerCallAtomic,
          commissionBps: monetizedService.commissionBps,
          network: monetizedService.network,
          active: monetizedService.active,
        }
      : null,
  };
}

function deploymentPackage(agent: typeof userAgents.$inferSelect, monetizedService: typeof monetizedAgents.$inferSelect | null) {
  const manifest = deploymentManifest(agent, monetizedService);
  const systemPrompt = [
    agent.persona,
    "",
    "Payment policy: require a valid paid-service settlement before billable execution.",
    "Agent Auth policy: verify CAAP/1.0 grants before tool use and require wallet approval for sensitive actions.",
  ].join("\n");

  return {
    manifest,
    files: {
      "cloudflare/wrangler.jsonc": JSON.stringify({
        name: `cheshire-agent-${agent.slug}`,
        main: "src/agent-worker.ts",
        compatibility_date: "2026-06-13",
        vars: {
          AGENT_SLUG: agent.slug,
          CHESHIRE_API_BASE: "https://cheshireterminal.ai",
          DEPLOY_MANIFEST_PATH: manifest.endpoints.manifest,
        },
      }, null, 2),
      "cloudflare/src/agent-worker.ts": [
        "export interface Env {",
        "  AGENT_SLUG: string;",
        "  CHESHIRE_API_BASE: string;",
        "  DEPLOY_MANIFEST_PATH: string;",
        "  AGENT_AUTH_SECRET?: string;",
        "  GOOGLE_AGENT_ENGINE_ID?: string;",
        "  X402_RECEIVER_WALLET?: string;",
        "}",
        "",
        "export default {",
        "  async fetch(request: Request, env: Env): Promise<Response> {",
        "    const url = new URL(request.url);",
        "    if (request.method === 'GET' && url.pathname === '/.well-known/agent.json') {",
        "      const manifest = await fetch(`${env.CHESHIRE_API_BASE}${env.DEPLOY_MANIFEST_PATH}`);",
        "      return new Response(await manifest.text(), {",
        "        headers: { 'content-type': 'application/json; charset=utf-8' },",
        "      });",
        "    }",
        "    if (request.method !== 'POST') {",
        "      return new Response('Not found', { status: 404 });",
        "    }",
        "    const auth = request.headers.get('authorization') || '';",
        "    const payment = request.headers.get('x-payment') || '';",
        "    if (!auth || !payment) {",
        "      return new Response(JSON.stringify({ error: 'Agent Auth grant and x402 payment are required' }), {",
        "        status: 402,",
        "        headers: { 'content-type': 'application/json; charset=utf-8' },",
        "      });",
        "    }",
        "    const upstream = await fetch(`${env.CHESHIRE_API_BASE}/api/agents/${env.AGENT_SLUG}/run`, {",
        "      method: 'POST',",
        "      headers: { authorization: auth, 'x-payment': payment, 'content-type': 'application/json' },",
        "      body: await request.text(),",
        "    });",
        "    return new Response(await upstream.text(), {",
        "      status: upstream.status,",
        "      headers: { 'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8' },",
        "    });",
        "  },",
        "};",
      ].join("\n"),
      "google-adk/agent.py": [
        "from google.adk.agents import Agent",
        "",
        `SYSTEM_PROMPT = ${JSON.stringify(systemPrompt)}`,
        "",
        "root_agent = Agent(",
        `    name=${JSON.stringify(agent.slug)},`,
        `    model=${JSON.stringify(agent.model)},`,
        "    description='Public paid Cheshire Terminal agent with CAAP/1.0 auth and x402 payment metadata.',",
        "    instruction=SYSTEM_PROMPT,",
        ")",
      ].join("\n"),
      "google-adk/deploy.py": [
        "import argparse",
        "from vertexai.preview import reasoning_engines",
        "from vertexai.preview.reasoning_engines import AdkApp",
        "from agent import root_agent",
        "",
        "def main() -> None:",
        "    parser = argparse.ArgumentParser()",
        "    parser.add_argument('--project', required=True)",
        "    parser.add_argument('--region', default='us-central1')",
        "    args = parser.parse_args()",
        "    app = AdkApp(agent=root_agent)",
        "    remote_agent = reasoning_engines.ReasoningEngine.create(",
        "        app,",
        `        display_name=${JSON.stringify(agent.name)},`,
        `        description=${JSON.stringify(manifest.description || agent.name)},`,
        "    )",
        "    print(remote_agent.resource_name)",
        "",
        "if __name__ == '__main__':",
        "    main()",
      ].join("\n"),
      "google-adk/agents-cli.md": [
        "# Agent Runtime deploy",
        "",
        "Install the Google agents CLI if needed:",
        "",
        "```sh",
        "uv tool install google-agents-cli",
        "```",
        "",
        "Deploy after tests and human approval:",
        "",
        "```sh",
        "agents-cli deploy --deployment-target agent_runtime --no-wait",
        "agents-cli deploy --status",
        "```",
      ].join("\n"),
    },
  };
}

async function serializeUserAgent(agent: typeof userAgents.$inferSelect) {
  const monetizedService = await getMonetizedAgent(agent.slug);
  return {
    ...agent,
    runtimeProfile: getUserAgentRuntimeProfile(agent),
    importedContext: resolveUserAgentImportedContext(agent),
    monetizedService,
    deployManifest: deploymentManifest(agent, monetizedService),
  };
}

// ── GET /api/user-agents — directory of all active agents ────────────────────
router.get("/", async (_req, res) => {
  if (!db) return res.json({ agents: [] });
  await ensureTable();
  try {
    const rows = await db
      .select()
      .from(userAgents)
      .where(eq(userAgents.status, "active"))
      .orderBy(desc(userAgents.createdAt))
      .limit(200);
    res.json({ agents: await Promise.all(rows.map(serializeUserAgent)) });
  } catch (e: any) {
    res.status(500).json({ agents: [], error: e.message });
  }
});

// ── GET /api/user-agents/by-owner/:wallet ────────────────────────────────────
router.get("/by-owner/:wallet", async (req, res) => {
  if (!db) return res.json({ agents: [] });
  await ensureTable();
  try {
    const rows = await db
      .select()
      .from(userAgents)
      .where(eq(userAgents.ownerWallet, req.params.wallet))
      .orderBy(desc(userAgents.createdAt));
    res.json({ agents: await Promise.all(rows.map(serializeUserAgent)) });
  } catch (e: any) {
    res.status(500).json({ agents: [], error: e.message });
  }
});

// ── GET /api/user-agents/by-slug/:slug ───────────────────────────────────────
router.get("/by-slug/:slug", async (req, res) => {
  if (!db) return res.status(404).json({ error: "Not found" });
  await ensureTable();
  try {
    const [row] = await db
      .select()
      .from(userAgents)
      .where(eq(userAgents.slug, req.params.slug.toLowerCase()));
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json({
      agent: row,
      runtimeProfile: getUserAgentRuntimeProfile(row),
      runtimeBridge: getUserAgentRuntimeBridge(row),
      importedContext: resolveUserAgentImportedContext(row),
      monetizedService: await getMonetizedAgent(row.slug),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/by-slug/:slug/runtime", async (req, res) => {
  if (!db) return res.status(404).json({ error: "Not found" });
  await ensureTable();
  try {
    const [row] = await db
      .select()
      .from(userAgents)
      .where(eq(userAgents.slug, req.params.slug.toLowerCase()));
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json({ runtimeProfile: getUserAgentRuntimeProfile(row) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/by-slug/:slug/bridge", async (req, res) => {
  if (!db) return res.status(404).json({ error: "Not found" });
  await ensureTable();
  try {
    const [row] = await db
      .select()
      .from(userAgents)
      .where(eq(userAgents.slug, req.params.slug.toLowerCase()));
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json({ runtimeBridge: getUserAgentRuntimeBridge(row) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/by-slug/:slug/adapter-status", async (req, res) => {
  if (!db) return res.status(404).json({ error: "Not found" });
  await ensureTable();
  try {
    const [row] = await db
      .select()
      .from(userAgents)
      .where(eq(userAgents.slug, req.params.slug.toLowerCase()));
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json({ adapterStatus: await getUserAgentAdapterStatus(row) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/by-slug/:slug/operational-data", async (req, res) => {
  if (!db) return res.status(404).json({ error: "Not found" });
  await ensureTable();
  try {
    const [row] = await db
      .select()
      .from(userAgents)
      .where(eq(userAgents.slug, req.params.slug.toLowerCase()));
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json({ operationalData: await getUserAgentOperationalData(row) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/by-slug/:slug/deploy-manifest", async (req, res) => {
  if (!db) return res.status(404).json({ error: "Not found" });
  await ensureTable();
  try {
    const [row] = await db
      .select()
      .from(userAgents)
      .where(eq(userAgents.slug, req.params.slug.toLowerCase()));
    if (!row) return res.status(404).json({ error: "Not found" });
    const monetizedService = await getMonetizedAgent(row.slug);
    res.json({ manifest: deploymentManifest(row, monetizedService) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/by-slug/:slug/deploy-package", async (req, res) => {
  if (!db) return res.status(404).json({ error: "Not found" });
  await ensureTable();
  try {
    const [row] = await db
      .select()
      .from(userAgents)
      .where(eq(userAgents.slug, req.params.slug.toLowerCase()));
    if (!row) return res.status(404).json({ error: "Not found" });
    const monetizedService = await getMonetizedAgent(row.slug);
    res.json(deploymentPackage(row, monetizedService));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/user-agents — create (token-gated ≥100k $CLAWD) ────────────────
router.post("/", async (req, res) => {
  if (!db) return res.status(503).json({ error: "DB unavailable" });
  await ensureTable();

  const parsed = insertUserAgentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input" });
  }
  const data = parsed.data;
  const slug = data.slug.toLowerCase();
  const importedPayload = loadBrowserAgents();
  const sourceAgent = data.sourceAgentId ? getBrowserAgent(data.sourceAgentId) : null;
  const recommendation = sourceAgent
    ? deriveBrowserAgentRecommendation(sourceAgent, importedPayload)
    : null;

  // Token gate
  const balance = await getClawdBalance(data.ownerWallet);
  if (balance < MIN_CLAWD_TO_DEPLOY) {
    return res.status(403).json({
      error: `Need at least ${MIN_CLAWD_TO_DEPLOY.toLocaleString()} $CLAWD to deploy a persistent agent. You hold ${Math.floor(balance).toLocaleString()}.`,
      balance,
      required: MIN_CLAWD_TO_DEPLOY,
    });
  }

  try {
    // Reject reserved/duplicate slugs
    const reserved = ["start", "help", "list", "agents", "new", "create", "delete", "admin", "clawd", "cheshire"];
    if (reserved.includes(slug)) {
      return res.status(400).json({ error: `Slug "${slug}" is reserved` });
    }
    const [existing] = await db.select().from(userAgents).where(eq(userAgents.slug, slug));
    if (existing) return res.status(409).json({ error: `Slug "${slug}" is already taken` });

    const [created] = await db
      .insert(userAgents)
      .values({
        ...data,
        slug,
        launchRuntime: data.launchRuntime || recommendation?.runtime || null,
        importedSpec:
          data.importedSpec ||
          (sourceAgent
            ? {
                sourceRoot: importedPayload.sourceRoot,
                sourceAgentId: sourceAgent.id,
                sourceTitle: sourceAgent.title,
                sourceCategory: sourceAgent.category,
                recommendation,
              }
            : null),
      })
      .returning();
    const serviceSpec = paidServiceSpec(created.importedSpec);
    const monetizedService = serviceSpec
      ? await upsertMonetizedAgentForDeployment({
          ownerUserId: req.session.userId ?? req.convexAuth?.userId ?? 0,
          slug,
          name: created.name,
          description: serviceSpec.priceUnit
            ? `${created.name} paid public agent. Unit: ${serviceSpec.priceUnit}. Visibility: ${serviceSpec.visibility}.`
            : created.greeting,
          ownerWallet: created.ownerWallet,
          recipientWallet: serviceSpec.recipientWallet || created.ownerWallet,
          pricePerCallAtomic: serviceSpec.pricePerCallAtomic,
        })
      : null;
    trackUsageFromRequest(req, {
      walletAddress: data.ownerWallet,
      eventType: "agent_deployment",
      productArea: "agents",
      model: data.model,
      route: "/api/user-agents",
      deploymentId: created.id ? String(created.id) : slug,
      agentId: slug,
      units: 1,
      metadata: {
        provider: data.provider,
        slug,
        name: data.name,
        sourceAgentId: data.sourceAgentId ?? undefined,
        launchRuntime: data.launchRuntime || recommendation?.runtime || undefined,
        monetizedAgentId: monetizedService?.id,
        pricePerCallAtomic: monetizedService?.pricePerCallAtomic,
      },
    });
    // Fire-and-forget: index into Upstash Search so agents are discoverable
    agentsIndex?.upsert([{
      id: String(created.id),
      content: {
        name: created.name,
        persona: created.persona,
        greeting: created.greeting ?? undefined,
        provider: created.provider,
        model: created.model,
      },
      metadata: {
        ownerWallet: created.ownerWallet,
        slug: created.slug,
        status: created.status,
        avatarUrl: created.avatarUrl ?? undefined,
        sourceAgentId: created.sourceAgentId ?? undefined,
        launchRuntime: created.launchRuntime ?? undefined,
      },
    }]).catch(err => console.error("[user-agents] search index error:", err));

    res.json({ success: true, agent: created, monetizedService, sourceAgent, recommendation });
  } catch (e: any) {
    console.error("[user-agents] create error:", e);
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/user-agents/:slug — owner can archive their own agent ────────
router.delete("/:slug", async (req, res) => {
  if (!db) return res.status(503).json({ error: "DB unavailable" });
  await ensureTable();
  const ownerWallet = (req.body as any)?.ownerWallet || req.query.wallet;
  if (!ownerWallet) return res.status(400).json({ error: "ownerWallet required" });
  try {
    const [row] = await db
      .select()
      .from(userAgents)
      .where(eq(userAgents.slug, req.params.slug.toLowerCase()));
    if (!row) return res.status(404).json({ error: "Not found" });
    if (row.ownerWallet !== ownerWallet)
      return res.status(403).json({ error: "Not the owner" });
    await db
      .update(userAgents)
      .set({ status: "archived" })
      .where(eq(userAgents.id, row.id));
    trackUsageFromRequest(req, {
      walletAddress: String(ownerWallet),
      eventType: "agent_archived",
      productArea: "agents",
      model: row.model,
      route: `/api/user-agents/${req.params.slug}`,
      deploymentId: String(row.id),
      agentId: row.slug,
      units: 1,
    });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/user-agents/gate/:wallet — convenience for frontend gating ──────
router.get("/gate/:wallet", async (req, res) => {
  const balance = await getClawdBalance(req.params.wallet);
  res.json({
    balance,
    required: MIN_CLAWD_TO_DEPLOY,
    canDeploy: balance >= MIN_CLAWD_TO_DEPLOY,
  });
});

export default router;
