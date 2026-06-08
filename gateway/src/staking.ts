/**
 * gateway/src/staking.ts
 *
 * Browser + API surface for the OpenClawd Metaplex Core staking primitive.
 * Uses Helius DAS for wallet ownership checks and prepares unsigned
 * stake/unstake transactions for wallet-side signing.
 */
import { Router, type Request, type Response } from 'express';
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  CLAWD_MINT,
  assetIsFrozen,
  getClawdTokenHolding,
  getOwnerDasAssets,
  heliusGetAsset,
  type DasAsset,
} from './solana.js';

const router = Router();

const BASE_URL = process.env.GATEWAY_BASE_URL ?? 'https://x402.wtf';
const PROGRAM_ID = process.env.OPENCLAWD_AGENT_STAKING_PROGRAM_ID ??
  'D5MLxrKAnppBVLuukKQzQGTMSfEwBqWCDPGAhGhthdLP';
const DEFAULT_COLLECTION = process.env.OPENCLAWD_AGENT_COLLECTION ?? '';
const STAKING_RPC_URL = process.env.OPENCLAWD_AGENT_STAKING_RPC_URL ??
  process.env.SOLANA_RPC_URL ??
  'https://api.devnet.solana.com';
const STAKING_CLUSTER = process.env.OPENCLAWD_AGENT_STAKING_CLUSTER ??
  (STAKING_RPC_URL.includes('devnet') ? 'devnet' : 'mainnet-beta');
const CORE_PROGRAM_ID = 'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d';
const GLOBAL_AUTHORITY_SEED = 'global-authority';

const STAKE_AGENT_DISCRIMINATOR = Buffer.from([57, 152, 69, 17, 172, 229, 29, 105]);
const UNSTAKE_AGENT_DISCRIMINATOR = Buffer.from([233, 246, 239, 66, 94, 179, 65, 38]);

function jsonError(res: Response, status: number, message: string): void {
  res.status(status).json({ error: message });
}

function publicKey(value: unknown, label: string): PublicKey {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing ${label}`);
  }
  try {
    return new PublicKey(value.trim());
  } catch {
    throw new Error(`Invalid ${label}`);
  }
}

function globalPoolPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from(GLOBAL_AUTHORITY_SEED)], programId)[0];
}

function assetCollection(asset: DasAsset | null): string | null {
  const group = asset?.grouping?.find((item) => item.group_key === 'collection');
  return group?.group_value ?? null;
}

function assetSummary(asset: DasAsset): Record<string, unknown> {
  return {
    id: asset.id,
    name: asset.content?.metadata?.name ?? asset.id,
    symbol: asset.content?.metadata?.symbol ?? null,
    interface: asset.interface ?? null,
    owner: asset.ownership?.owner ?? null,
    collection: assetCollection(asset),
    frozen: assetIsFrozen(asset),
    compressed: asset.compression?.compressed ?? false,
  };
}

function stakingConfig(): Record<string, unknown> {
  const programId = new PublicKey(PROGRAM_ID);
  return {
    baseUrl: BASE_URL,
    route: `${BASE_URL}/staking`,
    api: `${BASE_URL}/api/staking`,
    clawdMint: CLAWD_MINT,
    programId: programId.toBase58(),
    globalPool: globalPoolPda(programId).toBase58(),
    coreProgramId: CORE_PROGRAM_ID,
    collection: DEFAULT_COLLECTION || null,
    rpcUrl: STAKING_RPC_URL,
    cluster: STAKING_CLUSTER,
    agentSource: 'agents/Agent-Staking_Unstaking_solana_metaplex_core',
  };
}

async function buildStakingTransaction(input: {
  action: 'stake' | 'unstake';
  wallet: string;
  asset: string;
  collection: string;
  owner?: string;
}): Promise<Record<string, unknown>> {
  const programId = publicKey(PROGRAM_ID, 'staking program id');
  const wallet = publicKey(input.wallet, 'wallet');
  const asset = publicKey(input.asset, 'asset');
  const collection = publicKey(input.collection, 'collection');
  const coreProgram = publicKey(CORE_PROGRAM_ID, 'Metaplex Core program id');
  const assetInfo = await heliusGetAsset(asset.toBase58()).catch(() => null);
  const detectedOwner = assetInfo?.ownership?.owner ?? input.owner ?? input.wallet;
  const owner = publicKey(detectedOwner, 'asset owner');
  const detectedCollection = assetCollection(assetInfo);

  if (detectedCollection && detectedCollection !== collection.toBase58()) {
    throw new Error(`Asset collection ${detectedCollection} does not match ${collection.toBase58()}`);
  }

  if (input.action === 'stake' && owner.toBase58() !== wallet.toBase58()) {
    throw new Error('Only the asset owner can stake this agent');
  }

  const connection = new Connection(STAKING_RPC_URL, 'confirmed');
  const tx = new Transaction();
  tx.add(new TransactionInstruction({
    programId,
    data: input.action === 'stake' ? STAKE_AGENT_DISCRIMINATOR : UNSTAKE_AGENT_DISCRIMINATOR,
    keys: [
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: wallet, isSigner: true, isWritable: true },
      { pubkey: globalPoolPda(programId), isSigner: false, isWritable: true },
      { pubkey: asset, isSigner: false, isWritable: true },
      { pubkey: collection, isSigner: false, isWritable: true },
      { pubkey: coreProgram, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
  }));
  tx.feePayer = wallet;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  return {
    action: input.action,
    transaction: tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    }).toString('base64'),
    encoding: 'base64',
    wallet: wallet.toBase58(),
    owner: owner.toBase58(),
    asset: asset.toBase58(),
    collection: collection.toBase58(),
    programId: programId.toBase58(),
    globalPool: globalPoolPda(programId).toBase58(),
    rpcUrl: STAKING_RPC_URL,
    cluster: STAKING_CLUSTER,
  };
}

router.get(['/staking', '/agents/stake', '/stake'], (req: Request, res: Response) => {
  if (req.path !== '/staking') {
    res.redirect(302, '/staking');
    return;
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(stakingPageHtml());
});

router.get('/api/staking/config', (_req: Request, res: Response) => {
  res.json(stakingConfig());
});

router.get('/api/staking/portfolio/:owner', async (req: Request, res: Response) => {
  try {
    const owner = publicKey(req.params.owner, 'owner').toBase58();
    const collection = typeof req.query.collection === 'string'
      ? req.query.collection
      : DEFAULT_COLLECTION || undefined;
    const [clawd, agentAssets] = await Promise.all([
      getClawdTokenHolding(owner),
      getOwnerDasAssets(owner, collection),
    ]);

    const assets = agentAssets.assets.map(assetSummary);
    res.json({
      owner,
      clawd,
      collection: collection ?? null,
      holdsClawd: clawd.uiAmount > 0,
      holdsAgent: assets.length > 0,
      eligibleForRewards: clawd.uiAmount > 0 && assets.length > 0,
      totalDasAssets: agentAssets.total,
      agents: assets,
      config: stakingConfig(),
    });
  } catch (e) {
    jsonError(res, 400, (e as Error).message);
  }
});

router.post('/api/staking/transaction', async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      action?: string;
      wallet?: string;
      asset?: string;
      collection?: string;
      owner?: string;
    };
    if (body.action !== 'stake' && body.action !== 'unstake') {
      jsonError(res, 400, 'Required action: stake or unstake');
      return;
    }
    const collection = body.collection || DEFAULT_COLLECTION;
    if (!collection) {
      jsonError(res, 400, 'Missing collection. Set OPENCLAWD_AGENT_COLLECTION or pass collection in the request.');
      return;
    }
    res.json(await buildStakingTransaction({
      action: body.action,
      wallet: body.wallet ?? '',
      asset: body.asset ?? '',
      collection,
      owner: body.owner,
    }));
  } catch (e) {
    jsonError(res, 400, (e as Error).message);
  }
});

function stakingPageHtml(): string {
  const cfg = JSON.stringify(stakingConfig()).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OpenClawd Agent Staking</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #070807;
      --panel: #101513;
      --panel-2: #141b18;
      --text: #eef5ef;
      --muted: #9db2a3;
      --line: #2a3930;
      --accent: #58d68d;
      --warn: #f0b35c;
      --bad: #ff6b6b;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    main { max-width: 1180px; margin: 0 auto; padding: 28px 18px 48px; }
    header { display: flex; gap: 18px; align-items: flex-start; justify-content: space-between; border-bottom: 1px solid var(--line); padding-bottom: 18px; }
    h1 { margin: 0; font-size: 32px; line-height: 1.1; letter-spacing: 0; }
    h2 { margin: 0 0 12px; font-size: 18px; letter-spacing: 0; }
    p { color: var(--muted); line-height: 1.55; margin: 8px 0 0; }
    a { color: var(--accent); }
    button, input {
      border: 1px solid var(--line);
      background: var(--panel-2);
      color: var(--text);
      border-radius: 6px;
      min-height: 40px;
      font: inherit;
    }
    button { padding: 0 14px; cursor: pointer; font-weight: 650; }
    button.primary { background: var(--accent); color: #041008; border-color: var(--accent); }
    button:disabled { opacity: .55; cursor: not-allowed; }
    input { width: 100%; padding: 0 12px; }
    code { color: #d8ffe5; overflow-wrap: anywhere; }
    .toolbar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .grid { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 18px; margin-top: 18px; }
    .panel, .asset { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 16px; }
    .metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    .metric { background: var(--panel-2); border: 1px solid var(--line); border-radius: 6px; padding: 12px; min-height: 82px; }
    .metric b { display: block; font-size: 22px; margin-top: 5px; }
    .asset { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 14px; align-items: center; margin-top: 10px; }
    .asset h3 { margin: 0; font-size: 16px; letter-spacing: 0; }
    .asset small, .metric span { color: var(--muted); }
    .status { margin-top: 14px; padding: 12px; border-radius: 6px; background: #0d2116; border: 1px solid #1e6f43; color: #d9ffe5; min-height: 44px; }
    .status.error { background: #261113; border-color: #6f2a2f; color: #ffd7dc; }
    .pill { display: inline-flex; align-items: center; border: 1px solid var(--line); border-radius: 999px; padding: 3px 8px; color: var(--muted); font-size: 12px; margin-right: 6px; }
    .warn { color: var(--warn); }
    .bad { color: var(--bad); }
    @media (max-width: 820px) {
      header, .asset { display: block; }
      .grid, .metrics { grid-template-columns: 1fr; }
      .toolbar { margin-top: 12px; }
      .asset .toolbar { margin-top: 12px; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>OpenClawd Agent Staking</h1>
        <p>Check CLAWD and Metaplex Core agent holdings with Helius DAS, then stake or unstake eligible agent assets through the OpenClawd staking program.</p>
      </div>
      <div class="toolbar">
        <a href="/agents">Agents</a>
        <a href="/skills">Skills</a>
        <a href="/gateway">Gateway</a>
        <button id="connect" class="primary">Connect Wallet</button>
      </div>
    </header>

    <section class="grid">
      <div>
        <div class="panel">
          <h2>Wallet Scan</h2>
          <div class="toolbar">
            <input id="wallet" placeholder="Solana wallet address">
            <button id="scan">Scan</button>
          </div>
          <p>Collection filter: <code id="collectionLabel"></code></p>
          <div class="status" id="status">Connect Phantom or paste a wallet address.</div>
        </div>

        <div class="panel" style="margin-top:18px">
          <h2>Holdings</h2>
          <div class="metrics">
            <div class="metric"><span>CLAWD balance</span><b id="clawdBalance">-</b></div>
            <div class="metric"><span>Agent assets</span><b id="agentCount">-</b></div>
            <div class="metric"><span>Reward eligibility</span><b id="eligible">-</b></div>
          </div>
          <div id="assets"></div>
        </div>
      </div>

      <aside class="panel">
        <h2>Program</h2>
        <p>Cluster<br><code id="cluster"></code></p>
        <p>Program ID<br><code id="program"></code></p>
        <p>Global pool<br><code id="globalPool"></code></p>
        <p>CLAWD mint<br><code id="clawdMint"></code></p>
        <p>Source<br><code>agents/Agent-Staking_Unstaking_solana_metaplex_core</code></p>
      </aside>
    </section>
  </main>
  <script src="https://unpkg.com/@solana/web3.js@1.95.8/lib/index.iife.min.js"></script>
  <script>
    const config = ${cfg};
    const state = { wallet: null, provider: null, assets: [] };
    const el = (id) => document.getElementById(id);
    el('cluster').textContent = config.cluster;
    el('program').textContent = config.programId;
    el('globalPool').textContent = config.globalPool;
    el('clawdMint').textContent = config.clawdMint;
    el('collectionLabel').textContent = config.collection || 'Set OPENCLAWD_AGENT_COLLECTION or pass collection via API';

    function setStatus(message, error = false) {
      const node = el('status');
      node.textContent = message;
      node.className = error ? 'status error' : 'status';
    }

    function getProvider() {
      return window.phantom?.solana || window.solana || null;
    }

    async function connect() {
      const provider = getProvider();
      if (!provider) {
        setStatus('Phantom was not found. Install Phantom or paste a wallet address to scan holdings.', true);
        return;
      }
      const resp = await provider.connect();
      state.provider = provider;
      state.wallet = resp.publicKey.toString();
      el('wallet').value = state.wallet;
      setStatus('Connected ' + state.wallet);
      await scan();
    }

    async function scan() {
      const wallet = el('wallet').value.trim();
      if (!wallet) {
        setStatus('Enter a wallet address first.', true);
        return;
      }
      setStatus('Scanning Helius DAS holdings...');
      const query = config.collection ? '?collection=' + encodeURIComponent(config.collection) : '';
      const resp = await fetch('/api/staking/portfolio/' + encodeURIComponent(wallet) + query);
      const data = await resp.json();
      if (!resp.ok) {
        setStatus(data.error || 'Scan failed', true);
        return;
      }
      state.assets = data.agents || [];
      el('clawdBalance').textContent = Number(data.clawd.uiAmount || 0).toLocaleString();
      el('agentCount').textContent = String(state.assets.length);
      el('eligible').textContent = data.eligibleForRewards ? 'Yes' : 'No';
      renderAssets();
      if (data.holdsClawd && data.holdsAgent) setStatus('Wallet holds CLAWD and agent assets.');
      else if (data.holdsClawd) setStatus('Wallet holds CLAWD, but no matching agent assets were found.');
      else if (data.holdsAgent) setStatus('Wallet holds matching agent assets, but no CLAWD balance was found.');
      else setStatus('No CLAWD or matching agent assets found for this wallet.', true);
    }

    function renderAssets() {
      const root = el('assets');
      root.innerHTML = '';
      if (!state.assets.length) {
        root.innerHTML = '<p>No matching Metaplex Core agent assets found.</p>';
        return;
      }
      for (const asset of state.assets) {
        const node = document.createElement('div');
        node.className = 'asset';
        const action = asset.frozen ? 'unstake' : 'stake';
        node.innerHTML =
          '<div><h3>' + escapeHtml(asset.name || asset.id) + '</h3>' +
          '<small>' + escapeHtml(asset.id) + '</small><p>' +
          '<span class="pill">' + escapeHtml(asset.interface || 'asset') + '</span>' +
          '<span class="pill">' + (asset.frozen ? 'staked' : 'unstaked') + '</span>' +
          '</p></div>' +
          '<div class="toolbar"><button class="primary" data-action="' + action + '" data-asset="' + escapeHtml(asset.id) + '">' +
          (asset.frozen ? 'Unstake' : 'Stake') + '</button></div>';
        root.appendChild(node);
      }
      root.querySelectorAll('button[data-action]').forEach((button) => {
        button.addEventListener('click', () => submitAction(button.dataset.action, button.dataset.asset));
      });
    }

    async function submitAction(action, asset) {
      const wallet = state.wallet || el('wallet').value.trim();
      const provider = state.provider || getProvider();
      if (!provider || !provider.publicKey) {
        setStatus('Connect Phantom before submitting a staking transaction.', true);
        return;
      }
      if (provider.publicKey.toString() !== wallet) {
        setStatus('Connected wallet does not match the scanned wallet.', true);
        return;
      }
      setStatus('Preparing ' + action + ' transaction...');
      const prep = await fetch('/api/staking/transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, wallet, asset, collection: config.collection })
      });
      const payload = await prep.json();
      if (!prep.ok) {
        setStatus(payload.error || 'Transaction preparation failed', true);
        return;
      }
      const bytes = Uint8Array.from(atob(payload.transaction), (char) => char.charCodeAt(0));
      const tx = solanaWeb3.Transaction.from(bytes);
      const signed = await provider.signTransaction(tx);
      const connection = new solanaWeb3.Connection(payload.rpcUrl, 'confirmed');
      const signature = await connection.sendRawTransaction(signed.serialize());
      setStatus('Submitted ' + action + ': ' + signature);
      await connection.confirmTransaction(signature, 'confirmed');
      setStatus('Confirmed ' + action + ': ' + signature);
      await scan();
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      })[char]);
    }

    el('connect').addEventListener('click', connect);
    el('scan').addEventListener('click', scan);
  </script>
</body>
</html>`;
}

export default router;
