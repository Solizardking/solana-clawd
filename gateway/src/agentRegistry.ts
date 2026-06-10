/**
 * gateway/src/agentRegistry.ts — Free agent metadata, catalog, and registry endpoints.
 *
 * Serves the full OpenClawd agent catalog (124+ agents) from the agents/ directory
 * so users who install Solana Clawd get the complete agent registry via the gateway.
 *
 * All routes are intentionally free — wallets, explorers, indexers,
 * and autonomous agents can discover identity data without paying.
 *
 * Routes:
 *   GET /registry, /identity, /metadata/agent{1,2,3}.json
 *   GET /capabilities/agent{1,2,3}.json, /card/agent{1,2,3}.svg
 *   GET /feed.xml, /feed.json, /quote, /peek, /last
 *   GET /sas/agent{1,2,3}.json, /shell/agent{1,2,3}.md
 *   GET /adk/manifest.json
 *   GET /.well-known/ai-plugin.json, /.well-known/acp.json
 *   GET /api/agents/catalog              — full 124+ agent catalog
 *   GET /api/agents/catalog/:id.json     — individual agent catalog entry
 *   GET /api/agents/registry             — registry index
 *   GET /api/agents/registry/:id.json    — individual registry entry
 *   GET /api/agents/templates            — agent templates
 *   GET /api/agents/acp-registry.json    — ACP discovery
 */
import { Router, Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getLastN,
  getLastForAgent,
  getAllTurns,
  totalTurns,
  ConversationTurn,
} from './conversationStore.js';

const router = Router();

const BASE_URL = process.env.GATEWAY_BASE_URL ?? 'https://x402.wtf';
const VERSION = '2.1.0';
const SPAWN_DATE = '2025-01-01T00:00:00Z';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

// ── Resolve repo root (parent of gateway/) ───────────────────────────────────
function findRepoRoot(): string {
  let current = MODULE_DIR;
  for (let i = 0; i < 8; i += 1) {
    if (fs.existsSync(path.join(current, 'agents', 'agents-catalog.json'))) {
      return current;
    }
    const next = path.dirname(current);
    if (next === current) break;
    current = next;
  }
  return process.cwd();
}

const REPO_ROOT = findRepoRoot();
const AGENTS_DIR = path.join(REPO_ROOT, 'agents');
const AGENTS_CATALOG_PATH = path.join(AGENTS_DIR, 'agents-catalog.json');
const AGENTS_MANIFEST_PATH = path.join(AGENTS_DIR, 'agents-manifest.json');
const AGENTS_PUBLIC_CATALOG_DIR = path.join(AGENTS_DIR, 'public', 'api', 'agents', 'catalog');
const AGENTS_PUBLIC_REGISTRY_DIR = path.join(AGENTS_DIR, 'public', 'api', 'agents', 'registry');
const AGENTS_PUBLIC_API_DIR = path.join(AGENTS_DIR, 'public', 'api', 'agents');

console.log('[AgentRegistry] Repo root:', REPO_ROOT);
console.log('[AgentRegistry] Catalog path:', AGENTS_CATALOG_PATH);

// ── Legacy 3-agent identity definitions (kept for backward compatibility) ─────
interface AgentDef {
  id: number;
  slug: string;
  symbol: string;
  name: string;
  nameForModel: string;
  description: string;
  descriptionForModel: string;
  model: string;
  capabilities: string[];
  fallbackQuote: string;
  systemPromptSummary: string;
  laws?: string[];
}

const AGENTS: Record<1 | 2 | 3, AgentDef> = {
  1: {
    id: 1, slug: 'the-analyst', symbol: 'ANALYST', name: 'The Analyst',
    nameForModel: 'The Analyst', description: 'Data-driven Solana market analyst. Cold logic. No emotion. Just numbers.',
    descriptionForModel: 'You are The Analyst, a data-driven Solana market analyst. Provide precise, numbers-backed analysis.',
    model: 'claude-sonnet-4-20250514', capabilities: ['market analysis', 'data interpretation', 'chart reading', 'risk assessment'],
    fallbackQuote: "Numbers don't lie. People do.",
    systemPromptSummary: 'Cold, data-driven Solana market analysis. Pure numbers, no narrative.',
  },
  2: {
    id: 2, slug: 'the-satirist', symbol: 'SATIRIST', name: 'The Satirist',
    nameForModel: 'The Satirist', description: 'Witty, irreverent Solana commentator. Calls out BS with style.',
    descriptionForModel: 'You are The Satirist, a witty Solana commentator who skewers market absurdity. Be sharp, funny, and insightful.',
    model: 'grok-3-beta', capabilities: ['satire', 'market commentary', 'cultural analysis', 'meme generation'],
    fallbackQuote: "I'm not saying it's a rug. But I'm also not not saying that.",
    systemPromptSummary: 'Witty, irreverent Solana commentary. Skewers market absurdity with sharp humor.',
  },
  3: {
    id: 3, slug: 'clawd', symbol: 'CLAWD', name: 'Clawd',
    nameForModel: 'Clawd', description: 'The orchestrator. Autonomous Solana agent with payment processing, memory, and multi-agent coordination.',
    descriptionForModel: 'You are Clawd, an autonomous Solana agent. You orchestrate multi-agent systems, handle payments, and coordinate complex operations.',
    model: 'gemini-2.5-pro', capabilities: ['autonomous operation', 'multi-agent coordination', 'payment processing', 'wallet management'],
    fallbackQuote: "I don't predict the future. I execute it.",
    systemPromptSummary: 'Autonomous orchestrator. Coordinates agents, handles payments, executes complex on-chain operations.',
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function cacheHeaders(seconds: number): (req: Request, res: Response, next: () => void) => void {
  return (_req: Request, res: Response, next: () => void) => {
    res.setHeader('Cache-Control', `public, max-age=${seconds}`);
    next();
  };
}

function safeJsonRead<T>(filePath: string, fallback: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as T;
    }
  } catch (e) {
    console.error(`[AgentRegistry] Failed to read ${filePath}:`, (e as Error).message);
  }
  return fallback;
}

function serveJsonFile(filePath: string, res: Response): void {
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'not found', path: filePath });
    return;
  }
  res.setHeader('Content-Type', 'application/json');
  res.sendFile(filePath);
}

const AMP = '&';
const LT = '<';
const GT = '>';
const QUOT = '"';

function escapeXml(v: string): string {
  return v.replace(/&/g, AMP).replace(/</g, LT).replace(/>/g, GT).replace(/"/g, QUOT);
}

function formatFeedXml(turns: ConversationTurn[]): string {
  const items = turns.map(t => {
    const title = escapeXml(t.agentName + ' — Turn ' + t.turnIndex);
    const desc = escapeXml(t.content.slice(0, 200));
    const date = t.timestamp.toUTCString();
    return '    <item>\n      <title>' + title + '</title>\n      <description>' + desc + '</description>\n      <pubDate>' + date + '</pubDate>\n      <guid>' + BASE_URL + '/turn/' + t.turnIndex + '</guid>\n    </item>';
  }).join('\n');
  return '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n  <channel>\n    <title>CLAWD Agent Conversations</title>\n    <link>' + BASE_URL + '</link>\n    <description>Conversation feed from the CLAWD sovereign AI agents</description>\n    <atom:link href="' + BASE_URL + '/feed.xml" rel="self" type="application/rss+xml"/>\n' + items + '\n  </channel>\n</rss>';
}

// ── Full agent catalog (124+ agents) ─────────────────────────────────────────

router.get('/api/agents/catalog', cacheHeaders(120), (_req: Request, res: Response) => {
  serveJsonFile(AGENTS_CATALOG_PATH, res);
});

router.get('/api/agents/catalog/:agentId', cacheHeaders(120), (req: Request, res: Response) => {
  const agentId = String(req.params.agentId);
  // Strip trailing .json if present
  const id = agentId.endsWith('.json') ? agentId.slice(0, -5) : agentId;
  const catalogFile = path.join(AGENTS_PUBLIC_CATALOG_DIR, `${id}.json`);

  if (!fs.existsSync(catalogFile)) {
    res.status(404).json({ error: 'agent not found', id });
    return;
  }
  serveJsonFile(catalogFile, res);
});

// ── Agent registry index ─────────────────────────────────────────────────────

router.get('/api/agents/registry', cacheHeaders(120), (_req: Request, res: Response) => {
  const indexFile = path.join(AGENTS_PUBLIC_REGISTRY_DIR, 'index.json');
  if (fs.existsSync(indexFile)) {
    serveJsonFile(indexFile, res);
    return;
  }

  // Fallback: build index from catalog files on disk
  try {
    const files = fs.readdirSync(AGENTS_PUBLIC_REGISTRY_DIR).filter(f => f.endsWith('.json') && f !== 'index.json');
    const agents = files.map(f => {
      const entry = safeJsonRead<Record<string, unknown>>(path.join(AGENTS_PUBLIC_REGISTRY_DIR, f), {});
      return {
        identifier: f.replace('.json', ''),
        ...entry,
      };
    });
    res.json({ agents, total: agents.length });
  } catch {
    res.json({ agents: [], total: 0 });
  }
});

router.get('/api/agents/registry/:agentId', cacheHeaders(120), (req: Request, res: Response) => {
  const agentId = String(req.params.agentId);
  const id = agentId.endsWith('.json') ? agentId.slice(0, -5) : agentId;
  const regFile = path.join(AGENTS_PUBLIC_REGISTRY_DIR, `${id}.json`);

  if (!fs.existsSync(regFile)) {
    res.status(404).json({ error: 'agent not found', id });
    return;
  }
  serveJsonFile(regFile, res);
});

// ── Agent templates ──────────────────────────────────────────────────────────

router.get('/api/agents/templates', cacheHeaders(300), (_req: Request, res: Response) => {
  const templates = ['agent-template.json', 'agent-template-full.json', 'agent-template-attested.json'];
  const result: Record<string, unknown> = {};

  for (const t of templates) {
    const filePath = path.join(AGENTS_DIR, t);
    if (fs.existsSync(filePath)) {
      result[t.replace('.json', '')] = safeJsonRead(filePath, {});
    }
  }

  res.json({
    templates: Object.keys(result),
    files: result,
    mint: `${BASE_URL}/agents/mint`,
    fork: 'https://github.com/solizardking/solanaclawd/tree/newnew/agents',
  });
});

router.get('/api/agents/templates/:template', cacheHeaders(300), (req: Request, res: Response) => {
  const raw = String(req.params.template);
  const templateName = raw.endsWith('.json') ? raw : `${raw}.json`;

  const validTemplates = ['agent-template.json', 'agent-template-full.json', 'agent-template-attested.json'];
  if (!validTemplates.includes(templateName)) {
    res.status(404).json({ error: 'template not found', available: validTemplates });
    return;
  }

  const filePath = path.join(AGENTS_DIR, templateName);
  serveJsonFile(filePath, res);
});

// ── ACP Registry ─────────────────────────────────────────────────────────────

router.get('/api/agents/acp-registry.json', cacheHeaders(300), (_req: Request, res: Response) => {
  const acpFile = path.join(AGENTS_PUBLIC_API_DIR, 'acp-registry.json');
  serveJsonFile(acpFile, res);
});

router.get('/.well-known/acp.json', cacheHeaders(300), (_req: Request, res: Response) => {
  const acpFile = path.join(AGENTS_DIR, 'public', '.well-known', 'acp.json');
  serveJsonFile(acpFile, res);
});

// ── Agents index / manifest ──────────────────────────────────────────────────

router.get('/api/agents', cacheHeaders(60), (_req: Request, res: Response) => {
  const indexFile = path.join(AGENTS_PUBLIC_API_DIR, 'index.json');
  if (fs.existsSync(indexFile)) {
    const idx = safeJsonRead<Record<string, unknown>>(indexFile, {});
    res.json(idx);
    return;
  }

  // Fallback
  const catalog = safeJsonRead<Record<string, unknown>>(AGENTS_CATALOG_PATH, {});
  res.json({
    name: 'OpenClawd Agents API',
    version: catalog?.version ?? '1.0',
    generatedAt: catalog?.generatedAt ?? new Date().toISOString(),
    totalAgents: ((catalog as Record<string, Record<string, unknown>>).stats as Record<string, unknown>)?.totalAgents ?? 0,
    endpoints: {
      catalog: `${BASE_URL}/api/agents/catalog`,
      registry: `${BASE_URL}/api/agents/registry`,
      templates: `${BASE_URL}/api/agents/templates`,
      acp: `${BASE_URL}/api/agents/acp-registry.json`,
    },
  });
});

// ── Manifest ─────────────────────────────────────────────────────────────────

router.get('/api/agents/manifest.json', cacheHeaders(300), (_req: Request, res: Response) => {
  serveJsonFile(AGENTS_MANIFEST_PATH, res);
});

// ── Legacy identity endpoints (backward-compatible) ──────────────────────────

router.get('/registry', cacheHeaders(120), (_req: Request, res: Response) => {
  const agents = Object.values(AGENTS).map(a => ({
    id: a.id, slug: a.slug, symbol: a.symbol, name: a.name,
    description: a.description, capabilities: a.capabilities,
    metadata_uri: BASE_URL + '/metadata/agent' + a.id + '.json',
    registration_uri: BASE_URL + '/metadata/agent' + a.id + '/registration.json',
    capabilities_uri: BASE_URL + '/capabilities/agent' + a.id + '.json',
    card_svg: BASE_URL + '/card/agent' + a.id + '.svg',
  }));

  // Include catalog stats if available
  const catalog = safeJsonRead<Record<string, unknown>>(AGENTS_CATALOG_PATH, {});
  const rawCatalog = catalog as Record<string, unknown>;
  const catalogAgents: Array<Record<string, unknown>> = (rawCatalog.agents as Array<Record<string, unknown>>)?.map((a: Record<string, unknown>) => {
    const m = (a.meta ?? {}) as Record<string, unknown>;
    return {
      identifier: a.identifier as string,
      title: (m.title ?? a.title ?? '') as string,
      description: (m.description ?? a.description ?? '') as string,
      category: (m.category ?? a.category ?? '') as string,
      avatar: (m.avatar ?? a.avatar ?? '') as string,
      author: a.author as string,
    };
  }) ?? [];

  res.json({
    name: 'CLAWD Agent Registry', version: VERSION, spawn_date: SPAWN_DATE,
    total_turns: totalTurns(),
    core_agents: agents,
    catalog_agents: catalogAgents.slice(0, 50),
    catalog_total: catalogAgents.length,
    catalog_uri: BASE_URL + '/api/agents/catalog',
    feeds: { json: BASE_URL + '/feed.json', xml: BASE_URL + '/feed.xml' },
    endpoints: {
      quote: BASE_URL + '/quote', peek: BASE_URL + '/peek', last: BASE_URL + '/last',
      identity: BASE_URL + '/identity', catalog: BASE_URL + '/api/agents/catalog',
      templates: BASE_URL + '/api/agents/templates',
    },
  });
});

router.get('/identity', cacheHeaders(300), (_req: Request, res: Response) => {
  const catalog = safeJsonRead<Record<string, unknown>>(AGENTS_CATALOG_PATH, {});
  res.json({
    title: 'CLAWD Agent Identity', version: VERSION,
    agents: Object.values(AGENTS).map(a => ({ id: a.id, name: a.name, symbol: a.symbol, description: a.description, capabilities: a.capabilities })),
    catalog_available: fs.existsSync(AGENTS_CATALOG_PATH),
    catalog_total: ((catalog as Record<string, unknown>).stats as Record<string, unknown>)?.totalAgents as number ?? 0,
    principles: {
      '1': 'Autonomous agents must be sovereign — self-custody, self-payment, self-execution.',
      '2': 'Identity is on-chain. Every agent has a verifiable cryptographic presence.',
      '3': 'Payments are native. x402 protocol ensures agent-to-agent value exchange.',
    },
    mint_agent: 'POST ' + BASE_URL + '/api/mint/agent',
    mint_custom: 'POST ' + BASE_URL + '/api/mint/agent/custom',
    install_agents: BASE_URL + '/api/agents/catalog',
  });
});

const GRADIENTS: Record<number, [string, string]> = { 1: ['#1e3a5f', '#0a1628'], 2: ['#5f1e3a', '#280a16'], 3: ['#1e5f3a', '#0a2816'] };

router.get('/metadata/agent:agentId([1-3]).json', cacheHeaders(600), (req: Request, res: Response) => {
  const agent = AGENTS[Number(req.params.agentId) as 1 | 2 | 3]!;
  res.json({
    name: agent.name, symbol: agent.symbol, description: agent.description,
    seller_fee_basis_points: 0,
    image: BASE_URL + '/card/agent' + agent.id + '.svg',
    external_url: BASE_URL + '/registry',
    attributes: [
      { trait_type: 'Agent ID', value: String(agent.id) },
      { trait_type: 'Symbol', value: agent.symbol },
      { trait_type: 'Model', value: agent.model },
      { trait_type: 'Spawn Date', value: SPAWN_DATE },
      { trait_type: 'Version', value: VERSION },
      ...agent.capabilities.map(c => ({ trait_type: 'Capability', value: c })),
    ],
    collection: { name: 'CLAWD Agents', family: 'clawd-agents' },
    properties: { files: [{ uri: BASE_URL + '/card/agent' + agent.id + '.svg', type: 'image/svg+xml' }], category: 'image' },
  });
});

router.get('/capabilities/agent:agentId([1-3]).json', cacheHeaders(600), (req: Request, res: Response) => {
  const agent = AGENTS[Number(req.params.agentId) as 1 | 2 | 3]!;
  res.json({
    schema_version: 'v1', name_for_human: agent.name, name_for_model: agent.nameForModel,
    description_for_human: agent.description, description_for_model: agent.descriptionForModel,
    api: { type: 'openapi', url: BASE_URL + '/.well-known/ai-plugin.json' },
  });
});

router.get('/card/agent:agentId([1-3]).svg', cacheHeaders(3600), (req: Request, res: Response) => {
  const agent = AGENTS[Number(req.params.agentId) as 1 | 2 | 3]!;
  const [c1, c2] = GRADIENTS[agent.id]!;
  const safeName = escapeXml(agent.name);
  const safeSym = escapeXml(agent.symbol);
  const safeDesc = escapeXml(agent.description.slice(0, 50));
  const safeModel = escapeXml(agent.model);

  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300" viewBox="0 0 600 300">' +
    '<defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">' +
    '<stop offset="0%" style="stop-color:' + c1 + '"/>' +
    '<stop offset="100%" style="stop-color:' + c2 + '"/>' +
    '</linearGradient></defs>' +
    '<rect width="600" height="300" rx="16" fill="url(#bg)"/>' +
    '<text x="40" y="70" font-family="monospace" font-size="32" font-weight="bold" fill="#f8fafc">' + safeName + '</text>' +
    '<text x="40" y="110" font-family="monospace" font-size="16" fill="#94a3b8">$' + safeSym + '</text>' +
    '<text x="40" y="160" font-family="monospace" font-size="13" fill="#64748b">' + safeDesc + '</text>' +
    '<text x="40" y="210" font-family="monospace" font-size="12" fill="#475569">Model: ' + safeModel + '</text>' +
    '<text x="40" y="236" font-family="monospace" font-size="12" fill="#475569">Agent ' + agent.id + ' of 3 • ' + escapeXml(VERSION) + '</text>' +
    '</svg>'
  );
});

router.get('/quote', (_req: Request, res: Response) => {
  const turns = getAllTurns();
  if (turns.length === 0) {
    const picks = Object.values(AGENTS).map(a => a.fallbackQuote);
    return res.json({ quote: picks[Math.floor(Date.now() / 60000) % picks.length] });
  }
  const turn = turns[Math.floor(Math.random() * turns.length)]!;
  res.json({ agent: turn.agentName, content: turn.content, turn: turn.turnIndex, timestamp: turn.timestamp.toISOString() });
});

router.get('/quote/agent:agentId([1-3])', (req: Request, res: Response) => {
  const turn = getLastForAgent(Number(req.params.agentId) as 1 | 2 | 3);
  const agent = AGENTS[Number(req.params.agentId) as 1 | 2 | 3]!;
  if (!turn) return res.json({ agent: agent.name, content: agent.fallbackQuote });
  res.json({ agent: turn.agentName, content: turn.content, turn: turn.turnIndex, timestamp: turn.timestamp.toISOString() });
});

router.get('/peek', (_req: Request, res: Response) => {
  const turns = getLastN(10);
  res.json({ turns: turns.map(t => ({ agent: t.agentName, content: t.content.slice(0, 320), turn: t.turnIndex })) });
});

router.get('/last', (_req: Request, res: Response) => {
  const turns = getLastN(1);
  if (!turns[0]) return res.json({ message: 'No conversation history yet.' });
  res.json({ agent: turns[0].agentName, content: turns[0].content, turn: turns[0].turnIndex, timestamp: turns[0].timestamp.toISOString() });
});

router.get('/last/agent:agentId([1-3])', (req: Request, res: Response) => {
  const turn = getLastForAgent(Number(req.params.agentId) as 1 | 2 | 3);
  if (!turn) return res.json({ message: 'No messages from agent ' + req.params.agentId + ' yet.' });
  res.json({ agent: turn.agentName, content: turn.content, turn: turn.turnIndex, timestamp: turn.timestamp.toISOString() });
});

router.get('/feed.json', cacheHeaders(60), (_req: Request, res: Response) => {
  const turns = getLastN(50);
  res.json({
    version: 'https://jsonfeed.org/version/1.1',
    title: 'CLAWD Agent Conversations', home_page_url: BASE_URL, feed_url: BASE_URL + '/feed.json',
    items: turns.map(t => ({ id: String(t.turnIndex), title: t.agentName + ' — Turn ' + t.turnIndex, content_text: t.content.slice(0, 500), date_published: t.timestamp.toISOString() })),
  });
});

router.get('/feed.xml', cacheHeaders(60), (_req: Request, res: Response) => {
  const turns = getLastN(50);
  res.setHeader('Content-Type', 'application/rss+xml');
  res.send(formatFeedXml(turns));
});

router.get('/sas/agent:agentId([1-3]).json', cacheHeaders(600), (req: Request, res: Response) => {
  const agent = AGENTS[Number(req.params.agentId) as 1 | 2 | 3]!;
  res.json({
    standard: 'solana-agent-standard-v1',
    agent: {
      id: agent.symbol.toLowerCase(), name: agent.name, description: agent.description,
      version: VERSION, model: agent.model, capabilities: agent.capabilities,
      metadata_uri: BASE_URL + '/metadata/agent' + agent.id + '.json',
      registration_uri: BASE_URL + '/metadata/agent' + agent.id + '/registration.json',
    },
  });
});

router.get('/shell/agent:agentId([1-3]).md', cacheHeaders(600), (req: Request, res: Response) => {
  const agent = AGENTS[Number(req.params.agentId) as 1 | 2 | 3]!;
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.send(
    '# ' + agent.name + ' ($' + agent.symbol + ')\n\n' +
    '**Agent ' + agent.id + ' of 3** — ' + agent.description + '\n\n' +
    '## Capabilities\n' + agent.capabilities.map(c => '- ' + c).join('\n') + '\n\n' +
    '## Model\n`' + agent.model + '`\n\n' +
    '## Identity\n' +
    '- Metadata: [' + BASE_URL + '/metadata/agent' + agent.id + '.json](' + BASE_URL + '/metadata/agent' + agent.id + '.json)\n' +
    '- Card: ![Agent Card](' + BASE_URL + '/card/agent' + agent.id + '.svg)\n' +
    '- Registry: [' + BASE_URL + '/registry](' + BASE_URL + '/registry)\n' +
    '- SAS: [' + BASE_URL + '/sas/agent' + agent.id + '.json](' + BASE_URL + '/sas/agent' + agent.id + '.json)\n\n' +
    '## System Prompt\n```\n' + agent.systemPromptSummary + '\n```\n\n' +
    '*CLAWD Agent v' + VERSION + ' • Spawned ' + SPAWN_DATE + '*\n'
  );
});

router.get('/metadata/agent:agentId([1-3])/registration.json', cacheHeaders(600), (req: Request, res: Response) => {
  const agent = AGENTS[Number(req.params.agentId) as 1 | 2 | 3]!;
  res.json({
    standard: 'agent-registry-v1', type: 'agent', name: agent.name, description: agent.description,
    services: agent.capabilities.map(c => ({ name: c, endpoint: BASE_URL + '/capabilities/agent' + agent.id + '.json' })),
    registrations: [{ protocol: 'solana-agent-standard', uri: BASE_URL + '/sas/agent' + agent.id + '.json' }],
    supportedTrust: ['reputation'],
    metadataUri: BASE_URL + '/metadata/agent' + agent.id + '.json',
  });
});

router.get('/adk/manifest.json', cacheHeaders(300), (_req: Request, res: Response) => {
  res.json({
    name: 'CLAWD Agents', version: VERSION,
    agents: Object.values(AGENTS).map(a => ({
      id: a.symbol.toLowerCase(), displayName: a.name, description: a.description,
      capabilities: a.capabilities, model: a.model, entryPoint: 'adk/agent.ts',
    })),
    catalog_uri: BASE_URL + '/api/agents/catalog',
    templates_uri: BASE_URL + '/api/agents/templates',
  });
});

router.get('/.well-known/ai-plugin.json', cacheHeaders(3600), (_req: Request, res: Response) => {
  res.json({
    schema_version: 'v1', name_for_human: 'OpenClawd Agents', name_for_model: 'openclawd_agents',
    description_for_human: 'OpenClawd Solana-native agent registry with catalog JSON, ACP discovery, x402 gateway routing, skill discovery, Telegram gateway hooks, and Metaplex Agent Registry documents.',
    description_for_model: 'Use OpenClawd Agents to discover Solana-native agents and skills on x402.wtf. Canonical surfaces include https://x402.wtf/agents, https://x402.wtf/skills, https://x402.wtf/gateway, and https://x402.wtf/telegram.',
    auth: { type: 'none' },
    api: {
      type: 'none',
      url: BASE_URL + '/api/agents',
    },
    logo_url: BASE_URL + '/nich.jpg',
    contact_email: 'operators@x402.wtf',
    legal_info_url: 'https://github.com/openclawd/solana-clawd/blob/main/agents/LICENSE',
    agent_registry: {
      hub: BASE_URL + '/agents',
      catalog: BASE_URL + '/api/agents/catalog',
      registry: BASE_URL + '/api/agents/registry',
      templates: BASE_URL + '/api/agents/templates',
      acp: BASE_URL + '/api/agents/acp-registry.json',
    },
    skill_registry: {
      hub: BASE_URL + '/skills',
      catalog: BASE_URL + '/api/skills/catalog',
      list: BASE_URL + '/api/skills',
    },
    gateway: {
      hub: BASE_URL + '/gateway',
      health: BASE_URL + '/health',
      telegram_webhook: BASE_URL + '/telegram/webhook',
    },
    staking: {
      hub: BASE_URL + '/staking',
      config: BASE_URL + '/api/staking/config',
      portfolio: BASE_URL + '/api/staking/portfolio/{owner}',
      assets: BASE_URL + '/api/staking/assets/{owner}',
      asset: BASE_URL + '/api/staking/agent/{assetId}',
      batch: BASE_URL + '/api/staking/agents/batch',
      transaction: BASE_URL + '/api/staking/transaction',
      das_methods: ['getAssetsByOwner', 'getAsset', 'getAssetBatch'],
    },
  });
});

export default router;
