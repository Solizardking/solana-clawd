/**
 * gateway/src/agentRegistry.ts — Free agent metadata and registry endpoints.
 *
 * All routes here are intentionally free so wallets, explorers, indexers,
 * and autonomous agents can discover identity data without paying.
 *
 * Routes:
 *   GET /registry, /identity, /metadata/agent{1,2,3}.json
 *   GET /capabilities/agent{1,2,3}.json, /card/agent{1,2,3}.svg
 *   GET /feed.xml, /feed.json, /quote, /peek, /last
 *   GET /sas/agent{1,2,3}.json, /shell/agent{1,2,3}.md
 *   GET /adk/manifest.json
 *   GET /.well-known/ai-plugin.json
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
const AGENTS_CATALOG_PATH = path.join(REPO_ROOT, 'agents', 'agents-catalog.json');
const AGENTS_MANIFEST_PATH = path.join(REPO_ROOT, 'agents', 'agents-manifest.json');

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

function cacheHeaders(seconds: number): (req: Request, res: Response, next: () => void) => void {
  return (_req: Request, res: Response, next: () => void) => {
    res.setHeader('Cache-Control', `public, max-age=${seconds}`);
    next();
  };
}

const AMP = '&amp;';
const LT = '&lt;';
const GT = '&gt;';
const QUOT = '&quot;';

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

router.get('/registry', cacheHeaders(120), (_req: Request, res: Response) => {
  const agents = Object.values(AGENTS).map(a => ({
    id: a.id, slug: a.slug, symbol: a.symbol, name: a.name,
    description: a.description, capabilities: a.capabilities,
    metadata_uri: BASE_URL + '/metadata/agent' + a.id + '.json',
    registration_uri: BASE_URL + '/metadata/agent' + a.id + '/registration.json',
    capabilities_uri: BASE_URL + '/capabilities/agent' + a.id + '.json',
    card_svg: BASE_URL + '/card/agent' + a.id + '.svg',
  }));
  res.json({
    name: 'CLAWD Agent Registry', version: VERSION, spawn_date: SPAWN_DATE,
    total_turns: totalTurns(), agents,
    feeds: { json: BASE_URL + '/feed.json', xml: BASE_URL + '/feed.xml' },
    endpoints: { quote: BASE_URL + '/quote', peek: BASE_URL + '/peek', last: BASE_URL + '/last', identity: BASE_URL + '/identity' },
  });
});

router.get('/identity', cacheHeaders(300), (_req: Request, res: Response) => {
  res.json({
    title: 'CLAWD Agent Identity', version: VERSION,
    agents: Object.values(AGENTS).map(a => ({ id: a.id, name: a.name, symbol: a.symbol, description: a.description, capabilities: a.capabilities })),
    principles: {
      '1': 'Autonomous agents must be sovereign — self-custody, self-payment, self-execution.',
      '2': 'Identity is on-chain. Every agent has a verifiable cryptographic presence.',
      '3': 'Payments are native. x402 protocol ensures agent-to-agent value exchange.',
    },
    mint_agent: 'POST ' + BASE_URL + '/api/mint/agent',
    mint_custom: 'POST ' + BASE_URL + '/api/mint/agent/custom',
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
  });
});

router.get('/.well-known/ai-plugin.json', cacheHeaders(3600), (_req: Request, res: Response) => {
  res.json({
    schema_version: 'v1', name_for_human: 'CLAWD Agents', name_for_model: 'clawd_agents',
    description_for_human: 'Autonomous Solana AI agents with on-chain identity, payment processing, and multi-agent coordination.',
    description_for_model: 'Use the CLAWD agents for Solana analysis, market commentary, and autonomous operations.',
    auth: { type: 'none' },
    api: { type: 'openapi', url: BASE_URL + '/.well-known/openapi.yaml' },
    logo_url: 'https://raw.githubusercontent.com/x402agent/solana-clawd/main/assets/openclawd-banner.svg',
    legal_info_url: BASE_URL + '/identity',
  });
});

export default router;
