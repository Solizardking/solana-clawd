import { Router, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PublicKey } from '@solana/web3.js';
import { connection, getRpcUrl, heliusGetAsset } from './solana.js';

const router = Router();
const BASE_URL = process.env.GATEWAY_BASE_URL ?? 'https://x402.wtf';
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

function findRepoRoot(): string {
  let current = MODULE_DIR;
  for (let i = 0; i < 8; i += 1) {
    if (fs.existsSync(path.join(current, 'agents', 'agents-catalog.json'))) return current;
    const next = path.dirname(current);
    if (next === current) break;
    current = next;
  }
  return process.cwd();
}

const REPO_ROOT = findRepoRoot();
const AGENTS_CATALOG_PATH = path.join(REPO_ROOT, 'agents', 'agents-catalog.json');

type CatalogAgent = {
  identifier: string;
  title?: string;
  description?: string;
  avatar?: string;
  tags?: string[];
  category?: string;
  featured?: boolean;
  oneShot?: boolean;
  deploy?: Record<string, string>;
};

type CatalogFile = {
  stats?: {
    totalAgents?: number;
    byCategory?: Record<string, number>;
    metaplexEnabledAgents?: number;
    tradingCapableAgents?: number;
    launchCapableAgents?: number;
    mintCapableAgents?: number;
  };
  featured?: CatalogAgent[];
  oneShots?: CatalogAgent[];
  agents?: CatalogAgent[];
};

function safeJsonRead<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function loadSolanaAgents(): {
  stats: CatalogFile['stats'];
  agents: Array<CatalogAgent & { score: number; path: string }>;
} {
  const catalog = safeJsonRead<CatalogFile>(AGENTS_CATALOG_PATH, {});
  const raw = [...(catalog.featured ?? []), ...(catalog.oneShots ?? []), ...(catalog.agents ?? [])];
  const deduped = new Map<string, CatalogAgent>();
  for (const agent of raw) {
    if (!agent?.identifier) continue;
    if (!deduped.has(agent.identifier)) deduped.set(agent.identifier, agent);
  }

  const agents = [...deduped.values()]
    .filter((agent) => {
      const haystack = [
        agent.identifier,
        agent.title ?? '',
        agent.description ?? '',
        ...(agent.tags ?? []),
      ].join(' ').toLowerCase();
      return haystack.includes('solana') || agent.identifier.startsWith('clawd') || agent.identifier.startsWith('solana-');
    })
    .map((agent) => {
      const tags = agent.tags ?? [];
      let score = 0;
      if (agent.featured) score += 8;
      if (agent.oneShot) score += 5;
      if (tags.includes('trading-bot')) score += 3;
      if (tags.includes('defi')) score += 2;
      if (tags.includes('payments')) score += 1;
      return {
        ...agent,
        score,
        path: `${BASE_URL}/agents/${encodeURIComponent(agent.identifier)}`,
      };
    })
    .sort((a, b) => b.score - a.score || a.identifier.localeCompare(b.identifier));

  return { stats: catalog.stats, agents };
}

function isValidPubkey(value: string): boolean {
  try {
    // eslint-disable-next-line no-new
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

function renderBoardHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Solana Agent Board</title>
  <style>
    :root { color-scheme: dark; --bg:#07111f; --bg2:#13233f; --ink:#f8fafc; --muted:#93c5fd; --line:rgba(255,255,255,.12); --card:rgba(9,15,28,.74); --accent:#22d3ee; --good:#22c55e; }
    *{box-sizing:border-box} body{margin:0;font-family:ui-sans-serif,system-ui,sans-serif;background:linear-gradient(135deg,var(--bg),var(--bg2));color:var(--ink)}
    .wrap{max-width:1240px;margin:0 auto;padding:32px 20px 64px}
    .hero,.panel,.card{border:1px solid var(--line);background:var(--card);backdrop-filter: blur(10px);border-radius:24px}
    .hero{padding:28px}.hero h1{margin:0 0 8px;font-size:36px}.hero p{margin:0;color:var(--muted);max-width:760px;line-height:1.5}
    .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin:18px 0 24px}.panel{padding:18px}
    .label{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)} .value{margin-top:8px;font-size:30px;font-weight:800}
    .toolbar{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:18px 0 24px}.toolbar input{width:100%;padding:14px 16px;border-radius:16px;border:1px solid var(--line);background:#08111f;color:var(--ink)}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}
    .card{padding:18px;position:relative;overflow:hidden}.card::before{content:"";position:absolute;inset:0 0 auto 0;height:4px;background:linear-gradient(90deg,var(--accent),#f97316,var(--good))}
    .row{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.avatar{font-size:26px}.title{font-size:20px;font-weight:700;margin:0}.meta{margin-top:6px;color:var(--muted);font-size:13px}
    .desc{font-size:14px;line-height:1.45;color:#dbe7ff;min-height:64px}.tags{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}.tag{font-size:12px;padding:6px 9px;border-radius:999px;background:rgba(34,211,238,.12);color:#c8f8ff}
    .links{display:flex;gap:10px;flex-wrap:wrap}.links a{color:var(--ink);text-decoration:none;padding:10px 12px;border-radius:12px;background:#0b1628;border:1px solid var(--line)}
    @media (max-width:900px){.toolbar{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <div class="wrap">
    <section class="hero">
      <h1>Solana Agent Board</h1>
      <p>Mainnet-backed board for all Solana agents in OpenClawd. The client only talks to this gateway. The RPC key stays server-side in <code>HELIUS_RPC_URL</code> or <code>HELIUS_API_KEY</code>.</p>
      <div id="stats" class="stats"></div>
    </section>
    <section class="toolbar">
      <input id="search" placeholder="Search agents, tags, roles, categories" />
      <input id="explorerInput" placeholder="Paste Solana address or asset id, then press Enter" />
    </section>
    <section id="grid" class="grid"></section>
  </div>
  <script>
    const stats = document.getElementById('stats');
    const grid = document.getElementById('grid');
    const search = document.getElementById('search');
    const explorerInput = document.getElementById('explorerInput');
    let agents = [];
    function renderStats(meta) {
      const cards = [
        ['Solana agents', meta.totalAgents],
        ['Featured', meta.featuredAgents],
        ['Metaplex enabled', meta.metaplexEnabledAgents],
        ['RPC mode', meta.rpcVisibility],
      ];
      stats.innerHTML = cards.map(([label, value]) => '<div class="panel"><div class="label">'+label+'</div><div class="value">'+value+'</div></div>').join('');
    }
    function renderGrid(list) {
      grid.innerHTML = list.map((agent) => {
        const tags = (agent.tags || []).slice(0, 5).map((tag) => '<span class="tag">'+tag+'</span>').join('');
        return '<article class="card">' +
          '<div class="row"><div><h2 class="title">'+agent.title+'</h2><div class="meta">'+agent.identifier+' · '+(agent.category || 'agent')+'</div></div><div class="avatar">'+(agent.avatar || '🤖')+'</div></div>' +
          '<p class="desc">'+agent.description+'</p>' +
          '<div class="tags">'+tags+'</div>' +
          '<div class="links">' +
            '<a href="'+agent.path+'">Agent</a>' +
            '<a href="'+agent.catalogUrl+'">JSON</a>' +
            '<a href="'+agent.registryUrl+'">Registry</a>' +
          '</div>' +
          '</article>';
      }).join('');
    }
    function applyFilter() {
      const q = search.value.trim().toLowerCase();
      const list = !q ? agents : agents.filter((agent) => agent.searchText.includes(q));
      renderGrid(list);
    }
    search.addEventListener('input', applyFilter);
    explorerInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      const value = explorerInput.value.trim();
      if (!value) return;
      window.location.href = '/explorer/address/' + encodeURIComponent(value);
    });
    fetch('/api/agents/solana-board').then((r) => r.json()).then((data) => {
      agents = data.agents.map((agent) => ({ ...agent, searchText: [agent.identifier, agent.title, agent.description, agent.category, ...(agent.tags || [])].join(' ').toLowerCase() }));
      renderStats(data.meta);
      renderGrid(agents);
    }).catch((error) => {
      grid.innerHTML = '<div class="panel">Failed to load Solana agent board: ' + error.message + '</div>';
    });
  </script>
</body>
</html>`;
}

function renderExplorerShell(title: string, apiPath: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root{color-scheme:dark;--bg:#07111f;--bg2:#13233f;--ink:#f8fafc;--muted:#93c5fd;--line:rgba(255,255,255,.12)}
    body{margin:0;font-family:ui-sans-serif,system-ui,sans-serif;background:linear-gradient(135deg,var(--bg),var(--bg2));color:var(--ink)}
    .wrap{max-width:1100px;margin:0 auto;padding:32px 20px 64px}
    .panel{border:1px solid var(--line);background:rgba(9,15,28,.74);border-radius:24px;padding:24px}
    h1{margin:0 0 8px;font-size:32px} p{color:var(--muted)} pre{white-space:pre-wrap;word-break:break-word;background:#050c16;padding:18px;border-radius:18px;border:1px solid var(--line);overflow:auto}
    a{color:#c8f8ff}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="panel">
      <h1>${escapeHtml(title)}</h1>
      <p>Served by the gateway over a hidden mainnet RPC. Raw JSON API: <a href="${escapeHtml(apiPath)}">${escapeHtml(apiPath)}</a></p>
      <pre id="out">Loading...</pre>
    </div>
  </div>
  <script>
    fetch(${JSON.stringify(apiPath)}).then((r) => r.json()).then((data) => {
      document.getElementById('out').textContent = JSON.stringify(data, null, 2);
    }).catch((error) => {
      document.getElementById('out').textContent = 'Failed to load explorer data: ' + error.message;
    });
  </script>
</body>
</html>`;
}

router.get('/api/agents/solana-board', (_req: Request, res: Response) => {
  const { stats, agents } = loadSolanaAgents();
  res.json({
    meta: {
      network: 'solana-mainnet',
      rpcVisibility: 'server-only',
      rpcUrlHint: getRpcUrl().includes('api-key=') ? 'configured-hidden-mainnet-rpc' : 'configured-mainnet-rpc',
      totalAgents: agents.length,
      featuredAgents: agents.filter((agent) => agent.featured).length,
      metaplexEnabledAgents: stats?.metaplexEnabledAgents ?? 0,
      tradingCapableAgents: stats?.tradingCapableAgents ?? 0,
      launchCapableAgents: stats?.launchCapableAgents ?? 0,
      mintCapableAgents: stats?.mintCapableAgents ?? 0,
    },
    agents: agents.map((agent) => ({
      identifier: agent.identifier,
      title: agent.title ?? agent.identifier,
      description: agent.description ?? '',
      avatar: agent.avatar ?? '🤖',
      tags: agent.tags ?? [],
      category: agent.category ?? 'agent',
      featured: Boolean(agent.featured),
      oneShot: Boolean(agent.oneShot),
      catalogUrl: `${BASE_URL}/api/agents/catalog/${encodeURIComponent(agent.identifier)}.json`,
      registryUrl: `${BASE_URL}/api/agents/registry/${encodeURIComponent(agent.identifier)}.json`,
      path: agent.path,
    })),
  });
});

router.get('/agents/solana-board', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderBoardHtml());
});

router.get(['/agents', '/agent'], (_req: Request, res: Response) => {
  res.redirect(302, '/agents/solana-board');
});

router.get('/api/explorer/address/:address', async (req: Request, res: Response) => {
  const address = String(req.params.address);
  if (!isValidPubkey(address)) {
    res.status(400).json({ error: 'invalid address', address });
    return;
  }

  try {
    const pubkey = new PublicKey(address);
    const [accountInfo, signatures] = await Promise.all([
      connection.getAccountInfo(pubkey, 'confirmed'),
      connection.getSignaturesForAddress(pubkey, { limit: 20 }),
    ]);

    res.json({
      network: 'mainnet-beta',
      rpcVisibility: 'server-only',
      address,
      explorer: `https://explorer.solana.com/address/${address}?cluster=mainnet-beta`,
      account: accountInfo
        ? {
            lamports: accountInfo.lamports,
            owner: accountInfo.owner.toBase58(),
            executable: accountInfo.executable,
            rentEpoch: accountInfo.rentEpoch,
            dataLength: accountInfo.data.length,
          }
        : null,
      recentSignatures: signatures.map((sig) => ({
        signature: sig.signature,
        slot: sig.slot,
        err: sig.err,
        blockTime: sig.blockTime,
        explorer: `https://explorer.solana.com/tx/${sig.signature}?cluster=mainnet-beta`,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message, address });
  }
});

router.get('/api/explorer/asset/:assetId', async (req: Request, res: Response) => {
  const assetId = String(req.params.assetId);
  try {
    const asset = await heliusGetAsset(assetId);
    res.json({
      network: 'mainnet-beta',
      rpcVisibility: 'server-only',
      assetId,
      explorer: `https://explorer.solana.com/address/${assetId}?cluster=mainnet-beta`,
      asset,
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message, assetId });
  }
});

router.get('/explorer/address/:address', (req: Request, res: Response) => {
  const address = String(req.params.address);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderExplorerShell(`Solana Mainnet Explorer — ${address}`, `/api/explorer/address/${encodeURIComponent(address)}`));
});

router.get('/explorer/asset/:assetId', (req: Request, res: Response) => {
  const assetId = String(req.params.assetId);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderExplorerShell(`Solana Mainnet Asset Explorer — ${assetId}`, `/api/explorer/asset/${encodeURIComponent(assetId)}`));
});

router.get('/explorer', (_req: Request, res: Response) => {
  res.redirect('/agents/solana-board');
});

export default router;
