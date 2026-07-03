/**
 * gateway/src/solana.ts — Solana connection, wallet, and query helpers.
 * 
 * Adapted from x402agent/solana-clawd gateway for the solana-clawd monorepo.
 * Prefers Gatekeeper RPC (beta), falls back to standard Helius.
 */
import {
  Connection,
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
  type ParsedAccountData,
} from '@solana/web3.js';
import bs58 from 'bs58';

// ---------------------------------------------------------------------------
// Config from env
// ---------------------------------------------------------------------------
const HELIUS_API_KEY = process.env.HELIUS_API_KEY ?? '';
const HELIUS_RPC = process.env.HELIUS_RPC_URL || (HELIUS_API_KEY
  ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
  : '');
const HELIUS_PARSE_URL = process.env.HELIUS_PARSE_URL ?? '';
const GATEKEEPER_RPC = process.env.GATEKEEPER_RPC_URL ?? '';
const PRIVATE_KEY = process.env.SOLANA_PRIVATE_KEY ?? '';
const PUBLIC_KEY = process.env.SOLANA_PUBLIC_KEY ?? '';
export const CLAWD_MINT = '8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump';

// ---------------------------------------------------------------------------
// Connection — prefer Gatekeeper (beta), fallback to standard Helius
// ---------------------------------------------------------------------------
const rpcUrl = GATEKEEPER_RPC || HELIUS_RPC || 'https://api.mainnet-beta.solana.com';
if (!GATEKEEPER_RPC && !HELIUS_RPC) {
  console.warn('[gateway/solana] No RPC configured — falling back to public endpoint (rate-limited). Set HELIUS_RPC_URL for production.');
}

export const connection = new Connection(rpcUrl, {
  commitment: 'confirmed',
  wsEndpoint:
    process.env.HELIUS_ATLAS_WSS_URL ||
    process.env.HELIUS_WSS_URL ||
    process.env.HELIUS_WS_URL ||
    process.env.SOLANA_WSS_URL ||
    (HELIUS_API_KEY ? `wss://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}` : undefined),
});

export function getRpcUrl(): string {
  return rpcUrl;
}

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------
export function getKeypair(): Keypair | null {
  if (!PRIVATE_KEY) return null;
  try {
    return Keypair.fromSecretKey(bs58.decode(PRIVATE_KEY));
  } catch {
    return null;
  }
}

export function getPublicKey(): PublicKey | null {
  const kp = getKeypair();
  if (kp) return kp.publicKey;
  if (PUBLIC_KEY) return new PublicKey(PUBLIC_KEY);
  return null;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
export async function getBalance(address?: string): Promise<{ sol: number; lamports: number }> {
  const pubkey = address ? new PublicKey(address) : getPublicKey();
  if (!pubkey) throw new Error('No wallet address configured');
  const lamports = await connection.getBalance(pubkey);
  return { sol: lamports / LAMPORTS_PER_SOL, lamports };
}

export async function getTokenAccounts(owner?: string): Promise<Array<{
  mint: string;
  amount: string;
  decimals: number;
  uiAmount: number;
}>> {
  const pubkey = owner ? new PublicKey(owner) : getPublicKey();
  if (!pubkey) throw new Error('No wallet address configured');

  const resp = await connection.getParsedTokenAccountsByOwner(pubkey, {
    programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
  });

  return resp.value
    .map(({ account }) => {
      const data = account.data as ParsedAccountData;
      const info = data.parsed?.info;
      return {
        mint: info?.mint as string,
        amount: info?.tokenAmount?.amount as string,
        decimals: info?.tokenAmount?.decimals as number,
        uiAmount: info?.tokenAmount?.uiAmount as number,
      };
    })
    .filter(t => t.uiAmount > 0);
}

export async function getRecentTransactions(address?: string, limit = 10): Promise<Array<{
  signature: string;
  slot: number;
  blockTime: number | null;
  err: unknown;
}>> {
  const pubkey = address ? new PublicKey(address) : getPublicKey();
  if (!pubkey) throw new Error('No wallet address configured');

  const sigs = await connection.getSignaturesForAddress(pubkey, { limit });
  return sigs.map(s => ({
    signature: s.signature,
    slot: s.slot,
    blockTime: s.blockTime ?? null,
    err: s.err,
  }));
}

export async function getSlot(): Promise<number> {
  return connection.getSlot();
}

export async function getBlockHeight(): Promise<number> {
  return connection.getBlockHeight();
}

// ---------------------------------------------------------------------------
// Helius enhanced APIs
// ---------------------------------------------------------------------------
export async function heliusParseTransactions(signatures: string[]): Promise<unknown[]> {
  if (!HELIUS_PARSE_URL) return [];
  const resp = await fetch(HELIUS_PARSE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactions: signatures }),
  });
  if (!resp.ok) throw new Error(`Helius parse failed: ${resp.status}`);
  return resp.json() as Promise<unknown[]>;
}

export async function heliusGetAssetsByOwner(owner?: string): Promise<unknown> {
  return heliusDasRequest('getAssetsByOwner', {
    ownerAddress: owner ?? getPublicKey()?.toBase58(),
    page: 1,
    limit: 50,
  });
}

export async function heliusDasRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
  if (!HELIUS_API_KEY && !HELIUS_RPC) return { error: 'No Helius API key' };
  const bodyParams = { ...params };
  if (method === 'getAssetsByOwner') {
    bodyParams.ownerAddress = bodyParams.ownerAddress ?? getPublicKey()?.toBase58();
    if (!bodyParams.ownerAddress) throw new Error('No wallet address');
  }

  const url = HELIUS_RPC || `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: method,
      method,
      params: bodyParams,
    }),
  });
  if (!resp.ok) throw new Error(`Helius ${method} failed: ${resp.status}`);
  return resp.json();
}

export interface DasAsset {
  id: string;
  interface?: string;
  content?: {
    metadata?: {
      name?: string;
      symbol?: string;
      description?: string;
      attributes?: Array<{ trait_type?: string; value?: unknown }>;
    };
    files?: Array<{ uri?: string; mime?: string }>;
    links?: {
      image?: string;
      animation_url?: string;
      external_url?: string;
      [key: string]: unknown;
    };
  };
  grouping?: Array<{ group_key?: string; group_value?: string }>;
  ownership?: {
    owner?: string;
    frozen?: boolean;
  };
  token_info?: {
    balance?: number | string;
    decimals?: number;
    symbol?: string;
    supply?: number | string;
    token_program?: string;
    price_info?: {
      price_per_token?: number;
      total_price?: number;
      currency?: string;
      [key: string]: unknown;
    };
  };
  compression?: {
    compressed?: boolean;
  };
  authorities?: Array<{ address?: string; scopes?: string[] }>;
  creators?: Array<{ address?: string; share?: number; verified?: boolean }>;
  [key: string]: unknown;
}

interface DasAssetsByOwnerResponse {
  result?: {
    total?: number;
    limit?: number;
    page?: number;
    items?: DasAsset[];
  };
  error?: unknown;
}

interface ClawdHolding {
  mint: string;
  amount: string;
  uiAmount: number;
  source: 'das' | 'token-accounts';
}

export interface DasTokenHolding {
  mint: string;
  name: string;
  symbol: string | null;
  amount: string;
  decimals: number;
  uiAmount: number;
  priceUsd: number | null;
  valueUsd: number | null;
  interface: string | null;
  tokenProgram: string | null;
  asset: DasAsset;
}

export interface OwnerDasPortfolio {
  owner: string;
  total: number;
  page: number;
  limit: number;
  allAssets: DasAsset[];
  agentAssets: DasAsset[];
  tokenAssets: DasTokenHolding[];
}

function dasTokenUiAmount(asset: DasAsset): number {
  const balance = Number(asset.token_info?.balance ?? 0);
  const decimals = Number(asset.token_info?.decimals ?? 0);
  if (!Number.isFinite(balance)) return 0;
  return balance / 10 ** decimals;
}

function isCollectionMatch(asset: DasAsset, collection?: string): boolean {
  if (!collection) return true;
  return (asset.grouping ?? []).some((group) =>
    group.group_key === 'collection' && group.group_value === collection
  );
}

function dasMetadataText(asset: DasAsset): string {
  const metadata = asset.content?.metadata;
  const attributes = metadata?.attributes
    ?.map((attr) => `${attr.trait_type ?? ''} ${String(attr.value ?? '')}`)
    .join(' ') ?? '';
  return [
    asset.id,
    asset.interface ?? '',
    metadata?.name ?? '',
    metadata?.symbol ?? '',
    metadata?.description ?? '',
    attributes,
    ...(asset.grouping ?? []).map((group) => `${group.group_key ?? ''} ${group.group_value ?? ''}`),
  ].join(' ').toLowerCase();
}

function isFungibleDasAsset(asset: DasAsset): boolean {
  const iface = (asset.interface ?? '').toLowerCase();
  return iface.includes('fungible') || Number(asset.token_info?.decimals ?? 0) > 0;
}

function isLikelyAgentAsset(asset: DasAsset, collection?: string): boolean {
  if (!isCollectionMatch(asset, collection)) return false;
  if (collection) return true;
  if (isFungibleDasAsset(asset)) return false;
  const text = dasMetadataText(asset);
  return /\b(agent|clawd|openclawd|x402|metaplex core|core asset|staking)\b/.test(text);
}

export function assetIsFrozen(asset: DasAsset): boolean {
  if (asset.ownership?.frozen === true) return true;
  const plugins = asset.plugins as Record<string, unknown> | undefined;
  const freezeDelegate = plugins?.freezeDelegate as { frozen?: boolean } | undefined;
  return freezeDelegate?.frozen === true;
}

export async function heliusGetAsset(assetId: string): Promise<DasAsset | null> {
  const resp = await heliusDasRequest('getAsset', { id: assetId }) as { result?: DasAsset };
  return resp.result ?? null;
}

export async function heliusGetAssetBatch(assetIds: string[]): Promise<DasAsset[]> {
  const ids = [...new Set(assetIds.map((id) => id.trim()).filter(Boolean))].slice(0, 1000);
  if (ids.length === 0) return [];
  const resp = await heliusDasRequest('getAssetBatch', { ids }) as { result?: DasAsset[] };
  return resp.result ?? [];
}

export async function getClawdTokenHolding(owner: string): Promise<ClawdHolding> {
  const das = await heliusDasRequest('getAssetsByOwner', {
    ownerAddress: owner,
    page: 1,
    limit: 1000,
    options: {
      showFungible: true,
      showZeroBalance: false,
    },
  }) as DasAssetsByOwnerResponse;

  const dasToken = das.result?.items?.find((asset) => asset.id === CLAWD_MINT);
  const dasAmount = dasToken ? dasTokenUiAmount(dasToken) : 0;
  if (dasAmount > 0) {
    return {
      mint: CLAWD_MINT,
      amount: String(dasToken?.token_info?.balance ?? '0'),
      uiAmount: dasAmount,
      source: 'das',
    };
  }

  const tokenAccount = (await getTokenAccounts(owner).catch(() => []))
    .find((token) => token.mint === CLAWD_MINT);

  return {
    mint: CLAWD_MINT,
    amount: tokenAccount?.amount ?? '0',
    uiAmount: tokenAccount?.uiAmount ?? 0,
    source: 'token-accounts',
  };
}

export async function getOwnerDasAssets(owner: string, collection?: string): Promise<{
  total: number;
  assets: DasAsset[];
}> {
  const portfolio = await getOwnerDasPortfolio(owner, collection);
  return { total: portfolio.total, assets: portfolio.agentAssets };
}

export function dasTokenHolding(asset: DasAsset): DasTokenHolding {
  const uiAmount = dasTokenUiAmount(asset);
  const priceUsd = Number(asset.token_info?.price_info?.price_per_token);
  const valueUsd = Number(asset.token_info?.price_info?.total_price);
  return {
    mint: asset.id,
    name: asset.content?.metadata?.name ?? asset.token_info?.symbol ?? asset.id,
    symbol: asset.token_info?.symbol ?? asset.content?.metadata?.symbol ?? null,
    amount: String(asset.token_info?.balance ?? '0'),
    decimals: Number(asset.token_info?.decimals ?? 0),
    uiAmount,
    priceUsd: Number.isFinite(priceUsd) ? priceUsd : null,
    valueUsd: Number.isFinite(valueUsd) ? valueUsd : null,
    interface: asset.interface ?? null,
    tokenProgram: asset.token_info?.token_program ?? null,
    asset,
  };
}

export async function getOwnerDasPortfolio(owner: string, collection?: string): Promise<OwnerDasPortfolio> {
  const resp = await heliusDasRequest('getAssetsByOwner', {
    ownerAddress: owner,
    page: 1,
    limit: 1000,
    options: {
      showFungible: true,
      showNativeBalance: true,
      showCollectionMetadata: true,
      showUnverifiedCollections: true,
      showGrandTotal: true,
      showZeroBalance: false,
    },
  }) as DasAssetsByOwnerResponse;

  const result = resp.result;
  const items = result?.items ?? [];
  const tokenAssets = items
    .filter(isFungibleDasAsset)
    .map(dasTokenHolding)
    .filter((token) => token.uiAmount > 0);
  const agentAssets = items.filter((asset) => isLikelyAgentAsset(asset, collection));

  return {
    owner,
    total: result?.total ?? items.length,
    page: result?.page ?? 1,
    limit: result?.limit ?? 1000,
    allAssets: items,
    agentAssets,
    tokenAssets,
  };
}

// ---------------------------------------------------------------------------
// Summary for Telegram
// ---------------------------------------------------------------------------
export async function walletSummary(address?: string): Promise<string> {
  const pubkey = address ?? getPublicKey()?.toBase58() ?? 'unknown';
  const [bal, tokens] = await Promise.all([
    getBalance(address).catch(() => ({ sol: 0, lamports: 0 })),
    getTokenAccounts(address).catch(() => []),
  ]);

  const lines = [
    `🔑 *Wallet:* \`${pubkey}\``,
    `💰 *SOL Balance:* ${bal.sol.toFixed(4)} SOL`,
    '',
    `📦 *Token Accounts:* ${tokens.length}`,
  ];

  for (const t of tokens.slice(0, 10)) {
    lines.push(`  • \`${t.mint.slice(0, 8)}…\` — ${t.uiAmount}`);
  }
  if (tokens.length > 10) lines.push(`  …and ${tokens.length - 10} more`);

  return lines.join('\n');
}
