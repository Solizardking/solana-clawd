#!/usr/bin/env node
/**
 * 🦞 Library Sync — Build the Lobster Library index and copy public assets
 *
 * This script:
 *   1. Reads every agent JSON in `library/src/*.json`
 *   2. Writes the consolidated `library/public/index.json`
 *   3. Copies each `src/<id>.json` to `library/public/<id>.json`
 *   4. Copies the schema to `library/public/schema/`
 *   5. Copies the entire `library/public/` into `public/library/` so it is
 *      served at `https://x402.wtf/library/*` by the Vite web app.
 *
 * Run with:  node scripts/sync-library.mjs
 * Or:        npm run library:sync
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, cpSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT       = resolve(__dirname, '..');
const LIB_ROOT   = join(ROOT, 'library');
const SRC_DIR    = join(LIB_ROOT, 'src');
const PUB_DIR    = join(LIB_ROOT, 'public');
const SCHEMA_DIR = join(LIB_ROOT, 'schema');
const OUT_DIR    = join(ROOT, 'public', 'library');

const HOMEPAGE = 'https://x402.wtf/library';
const BASE_URL = 'https://x402.wtf/library';

const COLORS = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  red:    '\x1b[31m',
  dim:    '\x1b[2m',
};
const log  = (m) => console.log(`${COLORS.cyan}·${COLORS.reset}  ${m}`);
const ok   = (m) => console.log(`${COLORS.green}✓${COLORS.reset}  ${m}`);
const warn = (m) => console.log(`${COLORS.yellow}⚠${COLORS.reset}  ${m}`);
const die  = (m) => { console.error(`${COLORS.red}✗${COLORS.reset}  ${m}`); process.exit(1); };
const step = (m) => console.log(`\n${COLORS.bold}${COLORS.cyan}▶${COLORS.reset}  ${m}`);

if (!existsSync(SRC_DIR)) die(`library/src not found at ${SRC_DIR}`);

step('Reading source agents');
const sourceFiles = readdirSync(SRC_DIR).filter((f) => f.endsWith('.json'));
if (sourceFiles.length === 0) die('No agent JSON files found in library/src');

const agents = sourceFiles
  .map((f) => {
    const raw = readFileSync(join(SRC_DIR, f), 'utf8');
    try {
      return JSON.parse(raw);
    } catch (e) {
      warn(`Failed to parse ${f}: ${e.message}`);
      return null;
    }
  })
  .filter(Boolean)
  .sort((a, b) => (a.identifier || '').localeCompare(b.identifier || ''));

ok(`Loaded ${agents.length} agents`);

// Build category counts and tag index
const byCategory = {};
const allTags = new Set();
let totalKnowledge = 0;
for (const a of agents) {
  const cat = a.meta?.category || 'uncategorized';
  byCategory[cat] = (byCategory[cat] || 0) + 1;
  for (const t of a.meta?.tags || []) allTags.add(t);
  totalKnowledge += a.knowledgeCount || 0;
}

step('Writing library/public/ index');
if (existsSync(PUB_DIR)) rmSync(PUB_DIR, { recursive: true, force: true });
mkdirSync(PUB_DIR, { recursive: true });

const index = {
  $schema: 'https://x402.wtf/schema/lobsterLibraryCatalog.v1.json',
  apiVersion: '1.0',
  homepage: HOMEPAGE,
  baseUrl: BASE_URL,
  generatedAt: new Date().toISOString(),
  source: 'lobster-library',
  author: 'x402agent',
  stats: {
    totalAgents: agents.length,
    byCategory,
    totalTags: allTags.size,
    totalKnowledge,
  },
  categories: Object.keys(byCategory).sort().map((id) => ({
    id,
    label: id,
    count: byCategory[id],
  })),
  tags: [...allTags].sort(),
  agents: agents.map((a) => ({
    identifier: a.identifier,
    title: a.meta?.title || a.identifier,
    description: a.meta?.description || '',
    avatar: a.meta?.avatar || '🦞',
    category: a.meta?.category || 'uncategorized',
    author: a.author || 'x402agent',
    createdAt: a.createdAt,
    tags: a.meta?.tags || [],
    knowledgeCount: a.knowledgeCount || 0,
    tokenUsage: a.tokenUsage || 0,
    schemaVersion: a.schemaVersion || 1,
    deploy: {
      json: `${BASE_URL}/${a.identifier}.json`,
      homepage: HOMEPAGE,
    },
  })),
};

writeFileSync(join(PUB_DIR, 'index.json'), JSON.stringify(index, null, 2) + '\n');
ok('Wrote library/public/index.json');

step('Copying individual agent files');
for (const a of agents) {
  if (!a.identifier) continue;
  const out = join(PUB_DIR, `${a.identifier}.json`);
  // rewrite homepage to point at x402.wtf/library
  const outDoc = { ...a, homepage: HOMEPAGE };
  writeFileSync(out, JSON.stringify(outDoc, null, 2) + '\n');
}
ok(`Wrote ${agents.length} agent files`);

step('Copying schema');
if (existsSync(SCHEMA_DIR)) {
  const schemaOut = join(PUB_DIR, 'schema');
  mkdirSync(schemaOut, { recursive: true });
  for (const f of readdirSync(SCHEMA_DIR)) {
    if (f.endsWith('.json')) {
      cpSync(join(SCHEMA_DIR, f), join(schemaOut, f));
    }
  }
  ok('Schema files copied');
} else {
  warn('No schema directory found in library/');
}

step('Writing meta.json');
const meta = {
  agentCount: agents.length,
  schemaVersion: 1,
  knowledgeCount: totalKnowledge,
  generatedAt: new Date().toISOString(),
  homepage: HOMEPAGE,
  categories: Object.keys(byCategory).length,
  tags: allTags.size,
};
writeFileSync(join(PUB_DIR, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
ok('Wrote library/public/meta.json');

step(`Mirroring library/public → public/library (served at ${BASE_URL})`);
if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });
cpSync(PUB_DIR, OUT_DIR, { recursive: true });
ok(`Mirrored to ${OUT_DIR}`);

step('Writing library landing index.html (no-JS view)');
const landing = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>🦞 Lobster Library — x402.wtf</title>
  <meta name="description" content="The nano Solana financial trading, deep research, ML prediction market, x402 payment, and OpenClawd fleet library — 80+ specialized agents, served from x402.wtf." />
  <meta property="og:title" content="Lobster Library — x402.wtf" />
  <meta property="og:description" content="80+ specialized Solana agents for trading, DeFi, payments, and x402." />
  <meta property="og:url" content="${HOMEPAGE}" />
  <meta property="og:type" content="website" />
  <link rel="canonical" href="${HOMEPAGE}" />
  <link rel="alternate" type="application/json" href="${BASE_URL}/index.json" />
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; padding: 0; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; background: #0b1020; color: #e6eaf2; }
    main { max-width: 880px; margin: 0 auto; padding: 48px 24px 96px; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #94a3b8; background: #0f172a; border: 1px solid #1e293b; }
    h1 { font-size: 40px; line-height: 1.1; margin: 16px 0 8px; }
    h1 span { background: linear-gradient(90deg, #38bdf8, #a78bfa); -webkit-background-clip: text; background-clip: text; color: transparent; }
    p.lede { color: #94a3b8; font-size: 17px; line-height: 1.55; max-width: 60ch; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 32px 0 8px; }
    .stat { background: #0f172a; border: 1px solid #1e293b; border-radius: 12px; padding: 16px; }
    .stat b { display: block; font-size: 28px; }
    .stat span { color: #94a3b8; font-size: 13px; }
    .endpoints { margin-top: 24px; }
    .endpoints h2 { font-size: 18px; color: #cbd5e1; margin: 24px 0 8px; }
    .endpoints code, .endpoints a { display: block; padding: 10px 12px; background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; color: #cbd5e1; font-size: 14px; margin-bottom: 6px; text-decoration: none; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .endpoints a:hover { border-color: #38bdf8; }
    footer { margin-top: 48px; color: #64748b; font-size: 13px; }
  </style>
</head>
<body>
  <main>
    <span class="badge">x402.wtf/library</span>
    <h1>🦞 <span>Lobster Library</span></h1>
    <p class="lede">The nano Solana financial trading, deep research, ML prediction market, x402 payment, and OpenClawd fleet library. ${agents.length} specialized agents for trading, DeFi, payments, and x402.</p>

    <div class="stats">
      <div class="stat"><b>${agents.length}</b><span>agents</span></div>
      <div class="stat"><b>${Object.keys(byCategory).length}</b><span>categories</span></div>
      <div class="stat"><b>${allTags.size}</b><span>tags</span></div>
      <div class="stat"><b>${totalKnowledge}</b><span>knowledge</span></div>
    </div>

    <div class="endpoints">
      <h2>API</h2>
      <a href="${BASE_URL}/index.json">GET ${BASE_URL}/index.json</a>
      <a href="${BASE_URL}/meta.json">GET ${BASE_URL}/meta.json</a>
      <a href="${BASE_URL}/schema/speraxAgentSchema_v1.json">GET ${BASE_URL}/schema/speraxAgentSchema_v1.json</a>

      <h2>Sample agents</h2>
      ${agents.slice(0, 12).map((a) => `<a href="${BASE_URL}/${a.identifier}.json">${a.meta?.avatar || '🦞'} ${a.meta?.title || a.identifier}</a>`).join('\n      ')}
    </div>

    <footer>
      Hosted on <a style="color:#38bdf8" href="https://x402.wtf">x402.wtf</a> · built by <a style="color:#38bdf8" href="https://github.com/x402agent/LobsterLibrary">x402agent</a> · $CLAWD: 8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump
    </footer>
  </main>
</body>
</html>
`;
writeFileSync(join(OUT_DIR, 'index.html'), landing);
ok('Wrote public/library/index.html (no-JS view)');

console.log(`\n${COLORS.bold}${COLORS.green}🦞 Library synced → ${BASE_URL}${COLORS.reset}\n`);
console.log(`   ${agents.length} agents  ·  ${Object.keys(byCategory).length} categories  ·  ${allTags.size} tags`);
console.log(`   ${OUT_DIR}\n`);
