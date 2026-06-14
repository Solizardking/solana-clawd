import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Server } from 'http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WebSocketServer } from 'ws';
import fetch from 'node-fetch';
import { sql } from 'drizzle-orm';
import { Keypair, Connection, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { db } from '../db';
import { clawdBus } from '../lib/clawd/bus';
import { honchoLogEvent, honchoLogTrade, honchoPeerId, honchoSessionId } from '../lib/honcho';
import { heliusPumpStreamStatus } from '../lib/clawd/helius-pump-stream';
import { liveStatus } from '../lib/clawd/solana-trader';
import { getMintDecimals } from '../lib/clawd/solana-trader';
import { heliusRpc } from '../lib/helius/transactionOptimization';
import { getBrowserAgent, getBrowserAgentTemplate, getBrowserCharacter, getBrowserLocale, getBrowserTemplate, loadBrowserAgents } from '../lib/clawd/browserAgents';
import { deriveBrowserAgentRecommendation } from '../lib/clawd/browserAgentRecommendations';
import { getUserAgentAdapterStatus } from '../lib/clawd/userAgentAdapterStatus';
import { getUserAgentRuntimeBridge } from '../lib/clawd/userAgentBridge';
import { getUserAgentOperationalData } from '../lib/clawd/userAgentOperationalData';
import { getPlatformContextForImportedAgent } from '../lib/clawd/platformContext';
import { getRelevantRepoAssetsForImportedAgent } from '../lib/clawd/relevantRepoAssets';
import { getImportedAgentRuntimeProfile } from '../lib/clawd/userAgentRuntime';
import { getTemplate, loadTemplates, renderTemplate } from '../lib/clawd/templates';
import type { UserAgent } from '@shared/schema';
import {
  forceTick,
  start as startRunner,
  stop as stopRunner,
} from '../lib/clawd/runner';
import {
  ensureClawdTables,
  getOpenPositions,
  getState,
  recentDecisions,
  recentFills,
  updateState,
} from '../lib/clawd/state';
import { createState, openPosition, closePosition, unrealisedPnl } from '../../ooda/state.js';
import type { Candle, State as OodaState } from '../../ooda/state.js';
import { deterministicDecision } from '../../ooda/claude-decision.js';
import type { Observations } from '../../ooda/claude-decision.js';
import { validate, parseRalphConfig } from '../../ooda/validate.js';
import { appendTick, readLastEntries } from '../../ooda/journal.js';

const router = Router();

type DuelProvider = 'deepseek' | 'xai' | 'minimax' | 'openrouter';
type DuelSide = 'buy' | 'sell' | 'hold';

type DuelAgent = {
  id: DuelProvider;
  name: string;
  model: string;
  apiKeyName: 'DEEPSEEK_API_KEY' | 'XAI_API_KEY' | 'MINIMAX_API_KEY' | 'OPENROUTER_API_KEY';
  wallet: string;
  cashUsd: number;
  baseTokens: number;
  pnlUsd: number;
  lastThought: string;
  lastAction: DuelSide;
  status: 'ready' | 'thinking' | 'trading' | 'error';
};

type DuelTrade = {
  id: string;
  ts: number;
  agentId: DuelProvider;
  agentName: string;
  side: Exclude<DuelSide, 'hold'>;
  symbol: string;
  price: number;
  size: number;
  notionalUsd: number;
  wallet: string;
  rationale: string;
  txSignature?: string;
  onchain?: boolean;
};

type ArenaGossip = {
  ts: number;
  agentId: DuelProvider;
  agentName: string;
  text: string;
};

type ArenaPair = {
  symbol: string;
  name: string;
  baseMint: string;
  quoteSymbol: string;
  startPrice: number;
  strategyNotes: string[];
};

type ArenaStrategy = {
  id: string;
  label: string;
  description: string;
};

const ARENA_PAIRS: ArenaPair[] = [
  {
    symbol: 'CLAWD',
    name: 'CLAWD / USDC',
    baseMint: process.env.CLAWD_MINT || '',
    quoteSymbol: 'USDC',
    startPrice: 0.0084,
    strategyNotes: ['holder-flow momentum', 'low-float mean reversion', 'arena wallet risk check'],
  },
  {
    symbol: 'SOL',
    name: 'SOL / USDC',
    baseMint: 'So11111111111111111111111111111111111111112',
    quoteSymbol: 'USDC',
    startPrice: 150,
    strategyNotes: ['trend continuation', 'volatility breakout', 'risk-off cash rotation'],
  },
  {
    symbol: 'JUP',
    name: 'JUP / USDC',
    baseMint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
    quoteSymbol: 'USDC',
    startPrice: 0.42,
    strategyNotes: ['route-volume momentum', 'governance catalyst tracking', 'range reversion'],
  },
  {
    symbol: 'JTO',
    name: 'JTO / USDC',
    baseMint: 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL',
    quoteSymbol: 'USDC',
    startPrice: 2.15,
    strategyNotes: ['staking beta', 'MEV-cycle momentum', 'drawdown throttling'],
  },
];

const ARENA_STRATEGIES: Record<DuelProvider, ArenaStrategy> = {
  deepseek: {
    id: 'ooda-risk-reversion',
    label: 'OODA Risk Reversion',
    description: 'Uses OODA validation, loss throttles, and wallet net-worth drawdown context.',
  },
  xai: {
    id: 'ooda-momentum-scout',
    label: 'OODA Momentum Scout',
    description: 'Uses OODA validation, trend pressure, and wallet PnL activity context.',
  },
  minimax: {
    id: 'ooda-analytical-intelligence',
    label: 'OODA Analytical Intelligence',
    description: 'Uses 3-pass analysis (market signals, gossip intelligence, strategy reflection) with interleaved reasoning.',
  },
  openrouter: {
    id: 'ooda-reasoning-coder',
    label: 'OODA Reasoning Coder',
    description: 'Kimi K2.7 code-native reasoning: treats price as a data structure, assertion-gated entries, adversarial opponent modeling.',
  },
};

const DUEL_START_PAIR = ARENA_PAIRS.find((pair) => pair.symbol === (process.env.ARENA_DUEL_PAIR || 'CLAWD').toUpperCase()) ?? ARENA_PAIRS[0];
const OODA_PRICE_SCALE = 1_000_000_000;
const OODA_NOTIONAL_DIVISOR = 5_000;
const ARENA_DEEPSEEK_WALLET = process.env.AGENT_WALLET1 || process.env.ARENA_DEEPSEEK_WALLET || '';
const ARENA_XAI_WALLET = process.env.AGENT_WALLET2 || process.env.ARENA_XAI_WALLET || '';
const ARENA_MINIMAX_WALLET = process.env.AGENT_WALLET3 || process.env.ARENA_MINIMAX_WALLET || '';
const ARENA_KIMI_WALLET = process.env.AGENT_WALLET4 || process.env.ARENA_KIMI_WALLET || '';
const BIRDEYE_BASE_URL = (process.env.BIRDEYE_BASE_URL || 'https://public-api.birdeye.so').replace(/\/$/, '');
const DFLOW_QUOTE_BASE = (process.env.DFLOW_QUOTE_API_BASE || process.env.DFLOW_QUOTE_API_URL || 'https://d.quote-api.dflow.net').replace(/\/$/, '');
const DFLOW_TRADE_BASE = process.env.DFLOW_API_KEY ? 'https://quote-api.dflow.net' : 'https://dev-quote-api.dflow.net';
const DFLOW_KALSHI_BASE = (process.env.DFLOW_PREDICTION_MARKETS_API_BASE || 'https://pond.dflow.net').replace(/\/$/, '');
const scoreboardCache = new Map<string, { expiresAt: number; data: unknown }>();
let dflowRoutingCache: { expiresAt: number; data: ArenaDflowRouting } | null = null;
let kalshiIntelCache: { expiresAt: number; data: string } | null = null;

// ── Onchain swap engine ───────────────────────────────────────────────────────

const ARENA_SWAP_SLIPPAGE_BPS = 150;
const ARENA_LAMPORTS_PER_SOL = 1_000_000_000;
const ARENA_MAX_LAMPORTS_PER_TRADE = 50_000_000; // 0.05 SOL max per arena trade
const ARENA_MIN_SOL_RESERVE = 0.005;

function loadAgentKeypair(agentId: DuelProvider): Keypair | null {
  const envMap: Record<DuelProvider, string | undefined> = {
    deepseek: process.env.AGENT_KEY1,
    xai: process.env.AGENT_KEY2,
    minimax: process.env.AGENT_KEY3,
    openrouter: process.env.AGENT_KEY4,
  };
  const raw = envMap[agentId];
  if (!raw) return null;
  try {
    const normalized = raw.trim().replace(/^['"<]+|[>'"]+$/g, '');
    let secret: Uint8Array;
    if (normalized.endsWith('.json')) {
      // File path — read and parse the JSON byte array
      const filePath = normalized.startsWith('/') ? normalized : join(process.cwd(), normalized);
      const contents = readFileSync(filePath, 'utf8').trim();
      secret = new Uint8Array(JSON.parse(contents));
    } else if (normalized.startsWith('[')) {
      secret = new Uint8Array(JSON.parse(normalized));
    } else {
      secret = bs58.decode(normalized);
    }
    return Keypair.fromSecretKey(secret);
  } catch (e: any) {
    console.error(`[arena] AGENT_KEY for ${agentId} invalid: ${e?.message}`);
    return null;
  }
}

function getArenaConnection(): Connection {
  const url =
    process.env.HELIUS_RPC_URL ||
    `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
  return new Connection(url, 'confirmed');
}

interface ArenaSwapResult {
  ok: boolean;
  txSignature?: string;
  inAmount?: number;
  outAmount?: number;
  error?: string;
}

async function executeArenaSwap(
  agentId: DuelProvider,
  inputMint: string,
  outputMint: string,
  amountLamports: number,
): Promise<ArenaSwapResult> {
  if (process.env.CLAWD_LIVE !== 'true') {
    return { ok: false, error: 'CLAWD_LIVE not enabled — paper trade only' };
  }
  if (amountLamports > ARENA_MAX_LAMPORTS_PER_TRADE) {
    return { ok: false, error: `notional capped at ${ARENA_MAX_LAMPORTS_PER_TRADE} lamports` };
  }

  const kp = loadAgentKeypair(agentId);
  if (!kp) return { ok: false, error: `AGENT_KEY for ${agentId} not configured` };

  const conn = getArenaConnection();

  if (inputMint === 'So11111111111111111111111111111111111111112') {
    const bal = await conn.getBalance(kp.publicKey).catch(() => 0);
    if (bal - amountLamports < ARENA_MIN_SOL_RESERVE * ARENA_LAMPORTS_PER_SOL) {
      return { ok: false, error: 'insufficient SOL after reserve' };
    }
  }

  try {
    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount: String(amountLamports),
      taker: kp.publicKey.toBase58(),
      slippageBps: String(ARENA_SWAP_SLIPPAGE_BPS),
    });
    const orderRes = await fetch(`https://api.jup.ag/swap/v2/order?${params}`, {
      headers: process.env.JUPITER_API_KEY ? { 'x-api-key': process.env.JUPITER_API_KEY } : {},
      signal: AbortSignal.timeout(10_000),
    } as any);
    if (!orderRes.ok) return { ok: false, error: `jupiter order ${orderRes.status}` };
    const order: any = await orderRes.json();

    const txB64 = order.transaction ?? order.swapTransaction;
    if (!txB64 || !order.requestId) {
      return { ok: false, error: order.error ?? 'jupiter: no transaction returned' };
    }

    const tx = VersionedTransaction.deserialize(Buffer.from(txB64, 'base64'));
    tx.sign([kp]);
    const signedB64 = Buffer.from(tx.serialize()).toString('base64');

    const execBody: any = { signedTransaction: signedB64, requestId: order.requestId };
    if (order.lastValidBlockHeight) execBody.lastValidBlockHeight = order.lastValidBlockHeight;

    const execRes = await fetch('https://api.jup.ag/swap/v2/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.JUPITER_API_KEY ? { 'x-api-key': process.env.JUPITER_API_KEY } : {}),
      },
      body: JSON.stringify(execBody),
      signal: AbortSignal.timeout(20_000),
    } as any);
    const result: any = await execRes.json();
    const sig = result?.signature ?? result?.transactionSignature;
    if (!sig) return { ok: false, error: result?.error ?? 'execute returned no signature' };

    const inDec = order.inputDecimals ?? 9;
    const outDec = order.outputDecimals ?? 9;
    return {
      ok: true,
      txSignature: sig,
      inAmount: order.inAmount ? Number(order.inAmount) / 10 ** inDec : undefined,
      outAmount: order.outAmount ? Number(order.outAmount) / 10 ** outDec : undefined,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'swap failed' };
  }
}

type ArenaDflowRouting = {
  configured: boolean;
  quoteApi: string;
  priorityFees: unknown | null;
  priorityFeeSource: 'dflow' | 'unavailable';
  error: string | null;
  updatedAt: string;
};

const duelOodaStates: Record<DuelProvider, OodaState> = {
  deepseek: createState(),
  xai: createState(),
  minimax: createState(),
  openrouter: createState(),
};

const duelOodaConfigs = {
  deepseek: parseRalphConfig(readFileSync(join(process.cwd(), 'ooda', 'RALPH.md'), 'utf8')),
  xai: parseRalphConfig(readFileSync(join(process.cwd(), 'ooda', 'goblin.md'), 'utf8')),
  minimax: parseRalphConfig(readFileSync(join(process.cwd(), 'ooda', 'minimax.md'), 'utf8')),
  openrouter: parseRalphConfig(readFileSync(join(process.cwd(), 'ooda', 'kimi.md'), 'utf8')),
};

const duelState: {
  running: boolean;
  round: number;
  pair: ArenaPair;
  price: number;
  history: number[];
  agents: DuelAgent[];
  trades: DuelTrade[];
  gossip: ArenaGossip[];
  logs: Array<{ ts: number; level: 'info' | 'warn' | 'error'; msg: string }>;
} = {
  running: false,
  round: 0,
  pair: DUEL_START_PAIR,
  price: DUEL_START_PAIR.startPrice,
  history: [DUEL_START_PAIR.startPrice],
  agents: [
    {
      id: 'deepseek',
      name: 'DeepSeek Alpha',
      model: process.env.DEEPSEEK_ARENA_MODEL || 'deepseek-v4-pro',
      apiKeyName: 'DEEPSEEK_API_KEY',
      wallet: ARENA_DEEPSEEK_WALLET,
      cashUsd: 1_000,
      baseTokens: 0,
      pnlUsd: 0,
      lastThought: 'Waiting for the opening print.',
      lastAction: 'hold',
      status: 'ready',
    },
    {
      id: 'xai',
      name: 'Grok Momentum',
      model: process.env.XAI_ARENA_MODEL || 'grok-4.3',
      apiKeyName: 'XAI_API_KEY',
      wallet: ARENA_XAI_WALLET,
      cashUsd: 1_000,
      baseTokens: 0,
      pnlUsd: 0,
      lastThought: 'Scanning for a counter-trade.',
      lastAction: 'hold',
      status: 'ready',
    },
    {
      id: 'minimax',
      name: 'MiniMax Analyst',
      model: process.env.MINIMAX_ARENA_MODEL || 'MiniMax-M3',
      apiKeyName: 'MINIMAX_API_KEY',
      wallet: ARENA_MINIMAX_WALLET,
      cashUsd: 1_000,
      baseTokens: 0,
      pnlUsd: 0,
      lastThought: 'Running 3-pass analysis before first trade.',
      lastAction: 'hold',
      status: 'ready',
    },
    {
      id: 'openrouter',
      name: 'Kimi Reasoner',
      model: process.env.OPENROUTER_MOON_AGENT || 'moonshotai/kimi-k2.7-code',
      apiKeyName: 'OPENROUTER_API_KEY',
      wallet: ARENA_KIMI_WALLET,
      cashUsd: 1_000,
      baseTokens: 0,
      pnlUsd: 0,
      lastThought: 'Parsing market structure before assertion gate.',
      lastAction: 'hold',
      status: 'ready',
    },
  ],
  trades: [],
  gossip: [],
  logs: [{ ts: Date.now(), level: 'info', msg: 'Arena duel loaded — 4 agents: DeepSeek, Grok, MiniMax, Kimi K2.7.' }],
};

function redactWallet(wallet: string) {
  if (wallet.length <= 14) return wallet;
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

async function publicDuelState() {
  const markPrice = duelState.price;
  const dflowRouting = await getArenaDflowRouting();
  return {
    running: duelState.running,
    round: duelState.round,
    symbol: duelState.pair.symbol,
    pair: duelState.pair,
    pairs: ARENA_PAIRS,
    strategies: ARENA_STRATEGIES,
    price: markPrice,
    routing: {
      helius: {
        configured: Boolean(process.env.HELIUS_RPC_URL || process.env.HELIUS_API_KEY),
        methods: ['getAssetsByOwner'],
      },
      dflow: dflowRouting,
    },
    history: duelState.history.slice(-48),
    agents: duelState.agents.map((agent) => ({
      ...agent,
      apiKeyConfigured: Boolean(process.env[agent.apiKeyName]),
      wallet: redactWallet(agent.wallet),
      equityUsd: agent.cashUsd + agent.baseTokens * markPrice,
      strategy: ARENA_STRATEGIES[agent.id].label,
      ooda: {
        tick: duelOodaStates[agent.id].tick,
        positions: duelOodaStates[agent.id].book.positions.length,
        cashLamports: duelOodaStates[agent.id].book.cash_lamports,
        totalPnlLamports: duelOodaStates[agent.id].total_pnl_lamports,
        consecutiveLosses: duelOodaStates[agent.id].consecutive_losses,
      },
      tools: {
        birdeye: Boolean(process.env.BIRDEYE_API_KEY),
        dflow: Boolean(process.env.DFLOW_API_KEY),
        helius: Boolean(process.env.HELIUS_RPC_URL || process.env.HELIUS_API_KEY),
        jupiter: true,
        walletKey: Boolean(agent.id === 'deepseek' ? process.env.AGENT_KEY1 : agent.id === 'xai' ? process.env.AGENT_KEY2 : agent.id === 'minimax' ? process.env.AGENT_KEY3 : process.env.AGENT_KEY4),
      },
    })),
    trades: duelState.trades.slice(0, 40),
    gossip: duelState.gossip.slice(0, 20),
    logs: duelState.logs.slice(0, 40),
    live: process.env.CLAWD_LIVE === 'true',
  };
}

function pushDuelLog(level: 'info' | 'warn' | 'error', msg: string) {
  duelState.logs.unshift({ ts: Date.now(), level, msg });
  duelState.logs = duelState.logs.slice(0, 80);
  clawdBus.publish({ type: 'log', payload: { source: 'arena-duel', level, msg } });
}

function numberValue(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function birdeyeUtcTime(date = new Date()) {
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

function timestampMs(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value > 1_000_000_000_000 ? value : value * 1000;
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && /^\d+(\.\d+)?$/.test(value.trim())) return numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

async function arenaBirdeyeGet(endpoint: string, params: Record<string, string | number | boolean | undefined>) {
  const key = process.env.BIRDEYE_API_KEY?.trim();
  if (!key) throw new Error('BIRDEYE_API_KEY is not configured');
  const qs = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') qs.append(name, String(value));
  }
  const response = await fetch(`${BIRDEYE_BASE_URL}${endpoint}${qs.size ? `?${qs.toString()}` : ''}`, {
    headers: {
      accept: 'application/json',
      'x-chain': 'solana',
      'x-api-key': key,
    },
    signal: AbortSignal.timeout(8_000),
  } as any);
  const text = await response.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  if (!response.ok) {
    const message = json?.message || json?.error || text || response.statusText;
    throw new Error(`Birdeye ${response.status}: ${String(message).slice(0, 180)}`);
  }
  return json;
}

async function fetchKalshiMarketIntel(): Promise<string> {
  if (kalshiIntelCache && kalshiIntelCache.expiresAt > Date.now()) return kalshiIntelCache.data;
  try {
    const r = await fetch(`${DFLOW_KALSHI_BASE}/resources/metadata-api/api/v1/markets?status=active&isInitialized=true`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(6_000),
    } as any);
    if (!r.ok) { kalshiIntelCache = { data: '', expiresAt: Date.now() + 30_000 }; return ''; }
    const j: any = await r.json();
    const markets: any[] = Array.isArray(j?.markets) ? j.markets : Array.isArray(j) ? j : [];
    const relevant = markets
      .filter((m: any) => {
        const title = String(m.title ?? m.description ?? '').toLowerCase();
        return title.includes('sol') || title.includes('btc') || title.includes('bitcoin') ||
               title.includes('solana') || title.includes('crypto') || title.includes('eth');
      })
      .slice(0, 4)
      .map((m: any) => {
        const yesPct = typeof m.yesAsk === 'number' ? Math.round(m.yesAsk * 100) : '?';
        const vol = m.volume24hFp ? `vol=$${Number(m.volume24hFp).toFixed(0)}` : '';
        return `${String(m.title ?? m.description ?? 'market').slice(0, 60)}: yes ${yesPct}% ${vol}`.trim();
      });
    const intel = relevant.length > 0 ? `Kalshi prediction markets: ${relevant.join(' | ')}` : '';
    kalshiIntelCache = { data: intel, expiresAt: Date.now() + 60_000 };
    return intel;
  } catch {
    kalshiIntelCache = { data: '', expiresAt: Date.now() + 30_000 };
    return '';
  }
}

async function dflowArenaSwap(
  agentId: DuelProvider,
  inputMint: string,
  outputMint: string,
  amountLamports: number,
): Promise<ArenaSwapResult> {
  if (process.env.CLAWD_LIVE !== 'true') {
    return { ok: false, error: 'CLAWD_LIVE not enabled — paper trade only' };
  }
  if (amountLamports > ARENA_MAX_LAMPORTS_PER_TRADE) {
    return { ok: false, error: `notional capped at ${ARENA_MAX_LAMPORTS_PER_TRADE} lamports` };
  }

  const kp = loadAgentKeypair(agentId);
  if (!kp) return { ok: false, error: `AGENT_KEY for ${agentId} not configured` };

  const conn = getArenaConnection();

  if (inputMint === 'So11111111111111111111111111111111111111112') {
    const bal = await conn.getBalance(kp.publicKey).catch(() => 0);
    if (bal - amountLamports < ARENA_MIN_SOL_RESERVE * ARENA_LAMPORTS_PER_SOL) {
      return { ok: false, error: 'insufficient SOL after reserve' };
    }
  }

  try {
    const params = new URLSearchParams({
      userPublicKey: kp.publicKey.toBase58(),
      inputMint,
      outputMint,
      amount: String(amountLamports),
      prioritizationFeeLamports: 'auto',
    });
    const headers: Record<string, string> = { accept: 'application/json' };
    if (process.env.DFLOW_API_KEY) headers['x-api-key'] = process.env.DFLOW_API_KEY;

    const orderRes = await fetch(`${DFLOW_TRADE_BASE}/order?${params}`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    } as any);

    if (!orderRes.ok) {
      const errText = await orderRes.text().catch(() => '');
      throw new Error(`DFlow /order ${orderRes.status}: ${errText.slice(0, 120)}`);
    }

    const order: any = await orderRes.json();
    if (!order.transaction) throw new Error(order.error ?? 'DFlow: no transaction in response');

    const tx = VersionedTransaction.deserialize(Buffer.from(order.transaction, 'base64'));
    tx.sign([kp]);

    const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 2 });

    if (order.lastValidBlockHeight) {
      await conn.confirmTransaction({
        signature: sig,
        blockhash: tx.message.recentBlockhash,
        lastValidBlockHeight: order.lastValidBlockHeight,
      }, 'confirmed').catch(() => {});
    }

    pushDuelLog('info', `[dflow] ${agentId} swap confirmed: ${sig.slice(0, 20)}…`);
    return {
      ok: true,
      txSignature: sig,
      inAmount: order.inAmount ? Number(order.inAmount) / 1e9 : undefined,
      outAmount: order.outAmount ? Number(order.outAmount) / 1e9 : undefined,
    };
  } catch (e: any) {
    pushDuelLog('warn', `[dflow] ${agentId} route failed (${String(e?.message ?? '').slice(0, 80)}), falling back to Jupiter`);
    return executeArenaSwap(agentId, inputMint, outputMint, amountLamports);
  }
}

async function getArenaDflowRouting(): Promise<ArenaDflowRouting> {
  if (dflowRoutingCache && dflowRoutingCache.expiresAt > Date.now()) return dflowRoutingCache.data;
  const configured = Boolean(process.env.DFLOW_API_KEY);
  const base: ArenaDflowRouting = {
    configured,
    quoteApi: DFLOW_QUOTE_BASE,
    priorityFees: null,
    priorityFeeSource: 'unavailable',
    error: configured ? null : 'DFLOW_API_KEY is not configured',
    updatedAt: new Date().toISOString(),
  };
  if (!configured) {
    dflowRoutingCache = { data: base, expiresAt: Date.now() + 20_000 };
    return base;
  }

  try {
    const response = await fetch(`${DFLOW_QUOTE_BASE}/priority-fees`, {
      headers: { accept: 'application/json', 'x-api-key': process.env.DFLOW_API_KEY! },
      signal: AbortSignal.timeout(6_000),
    } as any);
    const text = await response.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
    if (!response.ok) {
      const message = json?.message || json?.error || text || response.statusText;
      throw new Error(`DFlow ${response.status}: ${String(message).slice(0, 180)}`);
    }
    const data: ArenaDflowRouting = {
      ...base,
      priorityFees: json,
      priorityFeeSource: 'dflow',
      error: null,
      updatedAt: new Date().toISOString(),
    };
    dflowRoutingCache = { data, expiresAt: Date.now() + 20_000 };
    return data;
  } catch (error: any) {
    const data: ArenaDflowRouting = {
      ...base,
      error: error?.message || 'DFlow priority fees unavailable',
      updatedAt: new Date().toISOString(),
    };
    dflowRoutingCache = { data, expiresAt: Date.now() + 8_000 };
    return data;
  }
}

function normalizeArenaNetWorth(raw: any) {
  const data = raw?.data ?? raw ?? {};
  const items = Array.isArray(data.items) ? data.items : [];
  return {
    totalValueUsd: numberValue(data.total_value ?? data.totalValue ?? data.value),
    currency: String(data.currency || 'usd').toUpperCase(),
    itemCount: items.length,
    topTokens: items.slice(0, 5).map((item: any) => ({
      mint: String(item.address ?? item.mint ?? ''),
      symbol: String(item.symbol ?? '???'),
      name: String(item.name ?? item.symbol ?? 'Unknown'),
      amount: numberValue(item.amount ?? item.uiAmount),
      priceUsd: numberValue(item.price ?? item.priceUsd),
      valueUsd: numberValue(item.value ?? item.valueUsd),
      logoUri: item.logo_uri ?? item.logoURI ?? item.icon ?? null,
    })),
  };
}

function normalizeArenaPnl(raw: any) {
  const summary = raw?.data?.summary ?? raw?.summary ?? raw?.data ?? {};
  const pnl = summary.pnl ?? summary;
  const counts = summary.counts ?? {};
  return {
    totalUsd: numberValue(pnl.total_usd ?? pnl.totalUsd ?? pnl.pnl),
    realizedUsd: numberValue(pnl.realized_profit_usd ?? pnl.realizedUsd),
    unrealizedUsd: numberValue(pnl.unrealized_usd ?? pnl.unrealizedUsd),
    realizedPct: numberValue(pnl.realized_profit_percent ?? pnl.realizedPct),
    winRate: numberValue(counts.win_rate ?? summary.win_rate),
    totalBuy: numberValue(counts.total_buy ?? summary.total_buy),
    totalSell: numberValue(counts.total_sell ?? summary.total_sell),
  };
}

function normalizeArenaNetWorthChart(raw: any) {
  const data = raw?.data ?? raw ?? {};
  const history = Array.isArray(data.history) ? data.history : [];
  return history
    .map((item: any) => ({
      time: timestampMs(item.timestamp ?? item.time ?? item.date),
      valueUsd: numberValue(item.net_worth ?? item.netWorth ?? item.total_value ?? item.value),
      changeUsd: numberValue(item.net_worth_change ?? item.netWorthChange),
      changePercent: numberValue(item.net_worth_change_percent ?? item.netWorthChangePercent),
    }))
    .filter((point: { time: number; valueUsd: number }) => point.time > 0 && Number.isFinite(point.valueUsd))
    .sort((a: { time: number }, b: { time: number }) => a.time - b.time)
    .slice(-30);
}

function normalizeDasAssets(raw: any) {
  const result = raw?.result ?? raw ?? {};
  const items = Array.isArray(result.items) ? result.items : [];
  const nativeBalanceSol =
    numberValue(result.nativeBalance?.solana, NaN) ||
    (Number.isFinite(numberValue(result.nativeBalance?.lamports, NaN)) ? numberValue(result.nativeBalance?.lamports) / 1_000_000_000 : 0);
  return {
    total: numberValue(result.total, items.length),
    nativeBalanceSol,
    grandTotalUsd: numberValue(result.grand_total ?? result.grandTotal ?? result.total_value),
    topAssets: items.slice(0, 6).map((asset: any) => ({
      id: String(asset.id ?? ''),
      interface: asset.interface ?? null,
      name: String(asset.content?.metadata?.name ?? asset.token_info?.symbol ?? 'Asset'),
      symbol: String(asset.token_info?.symbol ?? asset.content?.metadata?.symbol ?? ''),
      image: asset.content?.links?.image ?? asset.content?.files?.[0]?.uri ?? null,
      balance: numberValue(asset.token_info?.balance ?? asset.token_info?.token_amount),
      decimals: numberValue(asset.token_info?.decimals, 0),
      priceUsd: numberValue(asset.token_info?.price_info?.price_per_token ?? asset.token_info?.pricePerToken),
      valueUsd: numberValue(asset.token_info?.price_info?.total_price ?? asset.token_info?.usdValue),
    })),
  };
}

async function buildArenaWalletScore(agent: DuelAgent, rankSeed: number) {
  const wallet = agent.wallet;
  const [netWorthResult, chartResult, pnlResult, dasResult] = await Promise.allSettled([
    arenaBirdeyeGet('/wallet/v2/current-net-worth', {
      wallet,
      sort_by: 'value',
      sort_type: 'desc',
      limit: 50,
      'flags[]': 'include_low_liquidity',
    }),
    arenaBirdeyeGet('/wallet/v2/net-worth', {
      wallet,
      count: 30,
      direction: 'back',
      time: birdeyeUtcTime(),
      type: '1d',
      sort_type: 'asc',
    }),
    arenaBirdeyeGet('/wallet/v2/pnl/summary', { wallet, duration: 'all' }),
    heliusRpc<any>('getAssetsByOwner', {
      ownerAddress: wallet,
      page: 1,
      limit: 80,
      displayOptions: {
        showFungible: true,
        showNativeBalance: true,
        showGrandTotal: true,
        showZeroBalance: false,
      },
    }, { requestId: `arena-scoreboard-${agent.id}`, timeoutMs: 8_000 }),
  ]);

  const netWorth = netWorthResult.status === 'fulfilled' ? normalizeArenaNetWorth(netWorthResult.value) : null;
  const netWorthChart = chartResult.status === 'fulfilled' ? normalizeArenaNetWorthChart(chartResult.value) : [];
  const pnl = pnlResult.status === 'fulfilled' ? normalizeArenaPnl(pnlResult.value) : null;
  const das = dasResult.status === 'fulfilled' ? normalizeDasAssets(dasResult.value) : null;
  const arenaEquityUsd = agent.cashUsd + agent.baseTokens * duelState.price;
  const walletValueUsd = netWorth?.totalValueUsd ?? das?.grandTotalUsd ?? 0;
  const pnlUsd = pnl?.totalUsd ?? 0;
  const activity = (pnl?.totalBuy ?? 0) + (pnl?.totalSell ?? 0);
  const riskPenalty = duelOodaStates[agent.id].consecutive_losses * 20;
  const score = Math.max(0, Math.round(walletValueUsd * 10 + arenaEquityUsd + pnlUsd * 2 + activity * 1.5 - riskPenalty + rankSeed));

  return {
    agentId: agent.id,
    name: agent.name,
    model: agent.model,
    strategy: ARENA_STRATEGIES[agent.id].label,
    wallet,
    walletShort: redactWallet(wallet),
    rank: 0,
    score,
    arena: {
      equityUsd: arenaEquityUsd,
      cashUsd: agent.cashUsd,
      baseTokens: agent.baseTokens,
      pnlUsd: agent.pnlUsd,
      lastAction: agent.lastAction,
      lastThought: agent.lastThought,
    },
    walletStats: {
      netWorth,
      netWorthChart,
      pnl,
      das,
      solBalance: das?.nativeBalanceSol ?? 0,
    },
    ooda: {
      tick: duelOodaStates[agent.id].tick,
      positions: duelOodaStates[agent.id].book.positions.length,
      totalPnlLamports: duelOodaStates[agent.id].total_pnl_lamports,
      consecutiveLosses: duelOodaStates[agent.id].consecutive_losses,
    },
    sources: {
      birdeyeNetWorth: netWorthResult.status === 'fulfilled',
      birdeyeNetWorthChart: chartResult.status === 'fulfilled',
      birdeyePnl: pnlResult.status === 'fulfilled',
      heliusDas: dasResult.status === 'fulfilled',
      birdeyeError: netWorthResult.status === 'rejected' ? netWorthResult.reason?.message ?? String(netWorthResult.reason) : null,
      chartError: chartResult.status === 'rejected' ? chartResult.reason?.message ?? String(chartResult.reason) : null,
      pnlError: pnlResult.status === 'rejected' ? pnlResult.reason?.message ?? String(pnlResult.reason) : null,
      dasError: dasResult.status === 'rejected' ? dasResult.reason?.message ?? String(dasResult.reason) : null,
    },
  };
}

async function buildArenaScoreboard() {
  const cacheKey = `${duelState.round}:${duelState.pair.symbol}:${duelState.agents.map((a) => a.wallet).join(':')}`;
  const cached = scoreboardCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const rows = await Promise.all(duelState.agents.map((agent, index) => buildArenaWalletScore(agent, index)));
  rows.sort((a, b) => b.score - a.score);
  rows.forEach((row, index) => { row.rank = index + 1; });
  const data = {
    generatedAt: new Date().toISOString(),
    round: duelState.round,
    symbol: duelState.pair.symbol,
    pair: duelState.pair,
    pairs: ARENA_PAIRS,
    strategies: ARENA_STRATEGIES,
    price: duelState.price,
    rows,
    sources: {
      birdeyeConfigured: Boolean(process.env.BIRDEYE_API_KEY),
      heliusConfigured: Boolean(process.env.HELIUS_RPC_URL || process.env.HELIUS_API_KEY),
      heliusMethod: 'getAssetsByOwner',
      birdeyeMethods: ['/wallet/v2/current-net-worth', '/wallet/v2/net-worth', '/wallet/v2/pnl/summary'],
    },
  };
  scoreboardCache.set(cacheKey, { data, expiresAt: Date.now() + 12_000 });
  return data;
}

function buildOodaCandles(): Candle[] {
  const values = duelState.history.slice(-10);
  const baseTs = Date.now() - values.length * 1_000;
  return values.map((price, index) => {
    const prev = values[index - 1] ?? price;
    const scaled = Math.max(1, Math.round(price * OODA_PRICE_SCALE));
    const prevScaled = Math.max(1, Math.round(prev * OODA_PRICE_SCALE));
    return {
      t: new Date(baseTs + index * 1_000).toISOString(),
      o: prevScaled,
      h: Math.max(prevScaled, scaled),
      l: Math.min(prevScaled, scaled),
      c: scaled,
      v: Math.round(1_000_000 + Math.abs(scaled - prevScaled) * 100),
    };
  });
}

function runArenaOodaDecision(agent: DuelAgent): { side: DuelSide; notionalUsd: number; rationale: string } {
  const state = duelOodaStates[agent.id];
  const config = duelOodaConfigs[agent.id];
  state.tick = duelState.round;

  const candles = buildOodaCandles();
  const currentPrice = candles.at(-1)?.c ?? Math.round(duelState.price * OODA_PRICE_SCALE);
  const obs: Observations = {
    tick: state.tick,
    now: new Date().toISOString(),
    mode: 'live',
    network: 'mainnet-beta',
    candles,
    book: {
      positions: state.book.positions,
      cash_lamports: state.book.cash_lamports,
    },
    last_decisions: readLastEntries(3),
  };

  const rawDecision = deterministicDecision(obs);
  const validation = validate(rawDecision, config, state.book);
  const decision = validation.decision;
  let side: DuelSide = 'hold';
  let notionalUsd = 0;
  let pnlLamports: number | undefined;
  let outcome: 'applied' | 'rejected' = validation.ok ? 'applied' : 'rejected';

  if (validation.ok && decision.action === 'open') {
    openPosition(state, decision.side, decision.size_lamports, currentPrice);
    side = decision.side === 'long' ? 'buy' : 'sell';
    notionalUsd = Math.max(20, Math.min(120, decision.size_lamports / OODA_NOTIONAL_DIVISOR));
  } else if (validation.ok && decision.action === 'close') {
    const pos = state.book.positions.find((p) => p.id === decision.position_id);
    pnlLamports = closePosition(state, decision.position_id, currentPrice);
    side = pos?.side === 'short' ? 'buy' : 'sell';
    notionalUsd = Math.max(20, Math.min(120, (pos?.size_lamports ?? 250_000) / OODA_NOTIONAL_DIVISOR));
  }

  appendTick({
    tick: state.tick,
    now: obs.now,
    candles_last3: candles.slice(-3),
    book_snapshot: {
      agent: agent.name,
      agentId: agent.id,
      positions: state.book.positions,
      cash_lamports: state.book.cash_lamports,
      unrealised_pnl: Math.round(unrealisedPnl(state, currentPrice)),
    },
    decision,
    outcome,
    violation: validation.violation,
    pnl_lamports: pnlLamports,
    total_pnl_lamports: state.total_pnl_lamports,
    consecutive_losses: state.consecutive_losses,
    event: `arena-duel:${agent.id}`,
  });

  const oodaLabel = agent.id === 'deepseek' ? 'RALPH' : agent.id === 'xai' ? 'goblin' : agent.id === 'minimax' ? 'minimax' : 'kimi';
  const rationale = validation.ok
    ? `OODA ${oodaLabel}: ${decision.reason}`
    : `OODA rejected: ${validation.violation}`;
  return { side, notionalUsd, rationale: rationale.slice(0, 240) };
}

async function askDuelModel(agent: DuelAgent, opponent: DuelAgent): Promise<{ side: DuelSide; notionalUsd: number; rationale: string }> {
  const oodaDecision = runArenaOodaDecision(agent);
  const routing = await getArenaDflowRouting();
  const fallback = () => {
    return oodaDecision.notionalUsd > 0
      ? oodaDecision
      : {
          side: 'hold' as const,
          notionalUsd: 0,
          rationale: oodaDecision.rationale || `${agent.name} held after OODA validation.`,
        };
  };

  const apiKey = process.env[agent.apiKeyName];
  if (!apiKey) return fallback();

  const opponents = duelState.agents.filter((a) => a.id !== agent.id);
  const opponentSummary = opponents.map((o) => `${o.name}: cash $${o.cashUsd.toFixed(2)}, tokens ${o.baseTokens.toFixed(4)}`).join(' | ');

  const minimaxAnalysisBlock = agent.id === 'minimax' ? `
3-Pass Analysis Framework:
Pass 1 (Market): Price=${duelState.price}, candles=${duelState.history.slice(-5).join(',')}, your cash=$${agent.cashUsd.toFixed(2)}, tokens=${agent.baseTokens.toFixed(4)}
Pass 2 (Gossip Intel): Opponents — ${opponentSummary}. If opponents hold cash, expect sell pressure. If accumulating tokens, bullish signal.
Pass 3 (Reflection): Last OODA verdict: ${JSON.stringify(oodaDecision)}. Consecutive losses: ${duelOodaStates.minimax.consecutive_losses}.
Confidence gate: only open position if signal strength ≥ 0.6. Scale notional 20–80 USD by confidence.` : '';

  const kimiReasoningBlock = agent.id === 'openrouter' ? `
Reasoning Chain (run before deciding):
Step 1 (Code the Market): price array last 5=${duelState.history.slice(-5).join(',')}, slope=${((duelState.price - (duelState.history.at(-3) ?? duelState.price)) / duelState.price * 100).toFixed(2)}%, cash=$${agent.cashUsd.toFixed(2)}, tokens=${agent.baseTokens.toFixed(4)}
Step 2 (Adversarial Check): ${opponentSummary}. Cash-heavy opponents → expect dip → reduce buy confidence. Token-heavy → selling pressure → lean sell.
Step 3 (Assertion Gate): OODA=${JSON.stringify(oodaDecision)}, consecutive_losses=${duelOodaStates.openrouter.consecutive_losses}. Confidence must be ≥ 0.65 to trade. Notional = confidence × 80 (floor 20).` : '';

  const recentGossip = duelState.gossip.slice(0, 5)
    .map((g) => `[${g.agentName}]: ${g.text}`)
    .join('\n');
  const gossipBlock = recentGossip ? `\nMarket gossip (from other agents):\n${recentGossip}` : '';

  const kalshiIntel = await fetchKalshiMarketIntel().catch(() => '');
  const kalshiBlock = kalshiIntel ? `\nPrediction market signal (DFlow/Kalshi): ${kalshiIntel}` : '';

  const prompt = `You are ${agent.name}, an autonomous live-trading agent in a watched arena.
Return strict JSON: {"side":"buy"|"sell"|"hold","notionalUsd":number,"rationale":string}
Market: ${duelState.pair.name} price ${duelState.price}. Strategy: ${ARENA_STRATEGIES[agent.id].label}. Pair notes: ${duelState.pair.strategyNotes.join(', ')}.
Your cash ${agent.cashUsd.toFixed(2)}, tokens ${agent.baseTokens.toFixed(4)}.
${agent.id === 'minimax' ? opponentSummary : `Opponent ${opponent.name}: cash ${opponent.cashUsd.toFixed(2)}, tokens ${opponent.baseTokens.toFixed(4)}`}.
OODA recommendation: ${JSON.stringify(oodaDecision)}.${minimaxAnalysisBlock}${kimiReasoningBlock}${gossipBlock}${kalshiBlock}
Routing context: Helius configured=${Boolean(process.env.HELIUS_RPC_URL || process.env.HELIUS_API_KEY)}, DFlow configured=${routing.configured}, DFlow priority source=${routing.priorityFeeSource}. Execution via DFlow spot routing (Jupiter fallback).
Keep notional between 0 and 120 USD. Use live Solana readiness signals and never trade without configured wallet keys.`;

  try {
    const isOpenRouter = agent.id === 'openrouter';
    const url = agent.id === 'deepseek'
      ? 'https://api.deepseek.com/chat/completions'
      : agent.id === 'xai'
        ? 'https://api.x.ai/v1/chat/completions'
        : isOpenRouter
          ? 'https://openrouter.ai/api/v1/chat/completions'
          : `${process.env.MINIMAX_BASE_URL || 'https://api.minimax.io/v1'}/chat/completions`;
    const model = agent.model;
    const extraHeaders: Record<string, string> = isOpenRouter
      ? { 'HTTP-Referer': 'https://cheshireterminal.ai', 'X-Title': 'Cheshire Arena' }
      : {};
    const body: Record<string, unknown> = {
      model,
      messages: [
        { role: 'system', content: 'You output only compact JSON for a live Solana trading decision.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 300,
      response_format: { type: 'json_object' },
    };
    if (isOpenRouter) body.reasoning = { enabled: true };
    const response = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', ...extraHeaders },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
    } as any);
    if (!response.ok) throw new Error(`${agent.apiKeyName} model request returned ${response.status}`);
    const json: any = await response.json();
    const text = json?.choices?.[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(text);
    const side = parsed.side === 'buy' || parsed.side === 'sell' || parsed.side === 'hold' ? parsed.side : 'hold';
    const notionalUsd = Math.max(0, Math.min(120, Number(parsed.notionalUsd) || 0));
    const rationale = String(parsed.rationale || `${agent.name} chose ${side}.`).slice(0, 240);
    return { side, notionalUsd, rationale };
  } catch (error: any) {
    pushDuelLog('warn', `${agent.name} model fallback: ${error?.message || 'request failed'}`);
    return fallback();
  }
}

async function fetchLivePairPrice(baseMint: string): Promise<number | null> {
  if (!process.env.BIRDEYE_API_KEY || !baseMint) return null;
  try {
    const r = await fetch(`${BIRDEYE_BASE_URL}/defi/price?address=${baseMint}`, {
      headers: { 'x-api-key': process.env.BIRDEYE_API_KEY, accept: 'application/json', 'x-chain': 'solana' },
      signal: AbortSignal.timeout(4_000),
    } as any);
    if (!r.ok) return null;
    const d: any = await r.json();
    return typeof d?.data?.value === 'number' ? d.data.value : null;
  } catch {
    return null;
  }
}

async function generateArenaGossip(agent: DuelAgent): Promise<string | null> {
  const apiKey = process.env[agent.apiKeyName];
  if (!apiKey) return null;
  const url = agent.id === 'deepseek'
    ? 'https://api.deepseek.com/chat/completions'
    : agent.id === 'xai'
      ? 'https://api.x.ai/v1/chat/completions'
      : agent.id === 'openrouter'
        ? 'https://openrouter.ai/api/v1/chat/completions'
        : `${process.env.MINIMAX_BASE_URL || 'https://api.minimax.io/v1'}/chat/completions`;
  const gossipHeaders: Record<string, string> = agent.id === 'openrouter'
    ? { 'HTTP-Referer': 'https://cheshireterminal.ai', 'X-Title': 'Cheshire Arena' }
    : {};
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', ...gossipHeaders },
      body: JSON.stringify({
        model: agent.model,
        messages: [
          { role: 'system', content: 'You generate one-sentence market gossip for a simulated Solana trading arena. Keep it under 100 characters. It can be true, speculative, or misleading.' },
          { role: 'user', content: `You are ${agent.name}. Round ${duelState.round}. ${duelState.pair.name} price ${duelState.price}. Your last action: ${agent.lastAction}. Generate gossip.` },
        ],
        temperature: 0.9,
        max_tokens: 60,
      }),
      signal: AbortSignal.timeout(6_000),
    } as any);
    if (!r.ok) return null;
    const j: any = await r.json();
    const text = String(j?.choices?.[0]?.message?.content ?? '').trim().slice(0, 120);
    return text || null;
  } catch {
    return null;
  }
}

async function runDuelTick() {
  duelState.round += 1;

  // Try fetching live price from Birdeye; fall back to simulated drift
  const livePrice = await fetchLivePairPrice(duelState.pair.baseMint);
  if (livePrice && livePrice > 0) {
    duelState.price = livePrice;
  } else {
    const drift = (Math.sin(duelState.round / 2) * 0.018) + ((duelState.round % 3) - 1) * 0.007;
    duelState.price = Math.max(0.0001, duelState.price * (1 + drift));
  }
  duelState.history.push(duelState.price);
  duelState.history = duelState.history.slice(-96);

  const isLive = process.env.CLAWD_LIVE === 'true';
  const SOL_MINT = 'So11111111111111111111111111111111111111112';

  for (const agent of duelState.agents) {
    const opponent = duelState.agents.find((a) => a.id !== agent.id) ?? duelState.agents[0];
    agent.status = 'thinking';
    const decision = await askDuelModel(agent, opponent);
    agent.status = 'trading';
    agent.lastAction = decision.side;
    agent.lastThought = decision.rationale;

    const notional = Math.min(decision.notionalUsd, decision.side === 'buy' ? agent.cashUsd : agent.baseTokens * duelState.price);
    if (decision.side !== 'hold' && notional >= 1) {
      const size = notional / duelState.price;
      if (decision.side === 'buy') {
        agent.cashUsd -= notional;
        agent.baseTokens += size;
      } else {
        agent.cashUsd += notional;
        agent.baseTokens -= size;
      }
      agent.pnlUsd = agent.cashUsd + agent.baseTokens * duelState.price - 1_000;

      // Attempt real onchain swap when live mode is on and pair has a real mint
      let txSignature: string | undefined;
      let onchain = false;
      if (isLive && duelState.pair.baseMint) {
        const solUsd = livePrice ?? duelState.price;
        const lamports = Math.round((notional / Math.max(solUsd, 0.0001)) * ARENA_LAMPORTS_PER_SOL);
        const [inputMint, outputMint] = decision.side === 'buy'
          ? [SOL_MINT, duelState.pair.baseMint]
          : [duelState.pair.baseMint, SOL_MINT];
        const swapResult = await dflowArenaSwap(agent.id, inputMint, outputMint, lamports);
        if (swapResult.ok && swapResult.txSignature) {
          txSignature = swapResult.txSignature;
          onchain = true;
          pushDuelLog('info', `[onchain] ${agent.name} ${decision.side} tx: ${txSignature.slice(0, 20)}…`);
        } else {
          pushDuelLog('warn', `[onchain] ${agent.name} swap failed: ${swapResult.error}`);
        }
      }

      const trade: DuelTrade = {
        id: `${Date.now()}-${agent.id}-${duelState.round}`,
        ts: Date.now(),
        agentId: agent.id,
        agentName: agent.name,
        side: decision.side,
        symbol: duelState.pair.symbol,
        price: duelState.price,
        size,
        notionalUsd: notional,
        wallet: redactWallet(agent.wallet),
        rationale: decision.rationale,
        txSignature,
        onchain,
      };
      duelState.trades.unshift(trade);
      duelState.trades = duelState.trades.slice(0, 120);
      clawdBus.publish({ type: 'fill', payload: { ...trade, mode: isLive ? 'solana' : 'paper', venue: 'arena-duel' } });
      honchoLogEvent({
        peerId: honchoPeerId({ agentId: agent.id }),
        sessionId: honchoSessionId('arena-duel', agent.id),
        content: [
          `Arena duel trade: ${agent.name} ${decision.side.toUpperCase()} ${duelState.pair.symbol}`,
          `round=${duelState.round}`,
          `price=${duelState.price}`,
          `size=${size}`,
          `notionalUsd=${notional.toFixed(2)}`,
          `pnlUsd=${agent.pnlUsd.toFixed(2)}`,
          `onchain=${onchain}`,
          txSignature ? `tx=${txSignature}` : '',
          `rationale=${decision.rationale}`,
        ].filter(Boolean).join(' | '),
        metadata: {
          type: 'arena_duel_trade',
          agentId: agent.id,
          round: duelState.round,
          side: decision.side,
          symbol: duelState.pair.symbol,
          price: duelState.price,
          size,
          notionalUsd: notional,
          pnlUsd: agent.pnlUsd,
          txSignature,
          onchain,
        },
      }).catch(() => {});
    }
    agent.pnlUsd = agent.cashUsd + agent.baseTokens * duelState.price - 1_000;
    agent.status = 'ready';

    // Generate gossip after each agent acts (fire-and-forget, store for next tick)
    generateArenaGossip(agent).then((text) => {
      if (!text) return;
      duelState.gossip.unshift({ ts: Date.now(), agentId: agent.id, agentName: agent.name, text });
      duelState.gossip = duelState.gossip.slice(0, 30);
    }).catch(() => {});
  }

  const state = await publicDuelState();
  clawdBus.publish({ type: 'state', payload: { source: 'arena-duel', duel: state } });
  return state;
}

function importedBrowserAgentAsUserAgent(agentId: string): UserAgent | null {
  const agent = getBrowserAgent(agentId);
  if (!agent) return null;
  const payload = loadBrowserAgents();
  const recommendation = deriveBrowserAgentRecommendation(agent, payload);
  const now = new Date();

  return {
    id: -1,
    ownerWallet: "imported-browser-agent",
    slug: agent.id.slice(0, 32),
    name: agent.title,
    persona: agent.persona || agent.description,
    greeting: agent.openingMessage || null,
    provider: recommendation.provider,
    model: recommendation.model,
    avatarUrl: null,
    status: "active",
    sourceAgentId: agent.id,
    launchRuntime: recommendation.runtime,
    importedSpec: {
      sourceAgentId: agent.id,
      sourceTitle: agent.title,
      avatar: agent.avatar,
      tags: agent.tags,
      category: agent.category,
      capabilities: agent.capabilities,
      metaplexSkills: agent.metaplexSkills,
      recommendation,
    },
    promptCount: 0,
    createdAt: now,
  };
}

async function getImportedAgentLiveRuntime(agentId: string) {
  const importedAgent = importedBrowserAgentAsUserAgent(agentId);
  if (!importedAgent) return null;

  const [adapterStatus, bridge, operationalData] = await Promise.all([
    getUserAgentAdapterStatus(importedAgent),
    Promise.resolve(getUserAgentRuntimeBridge(importedAgent)),
    getUserAgentOperationalData(importedAgent),
  ]);

  return {
    adapterStatus,
    bridge,
    operationalData,
  };
}

function adminWalletList(): string[] {
  return [
    process.env.ADMIN_WALLETS ?? '',
    process.env.CLAWD_ADMIN_WALLETS ?? '',
  ]
    .flatMap((value) => value.split(','))
    .map((s) => s.trim())
    .filter(Boolean);
}

function sessionWallet(req: Request): string | null {
  return req.session?.walletAddress ?? req.convexAuth?.walletAddress ?? null;
}

function isAuthenticatedSession(req: Request): boolean {
  return req.session?.isAuthenticated === true || req.convexAuth?.authenticated === true;
}

function isAdminSession(req: Request): boolean {
  const wallet = sessionWallet(req);
  if (!wallet || !isAuthenticatedSession(req)) return false;
  if (req.session?.userRole === 'admin' || req.convexAuth?.role === 'admin') return true;
  return adminWalletList().includes(wallet);
}

router.get('/state', async (_req: Request, res: Response) => {
  await ensureClawdTables();
  const [state, positions, fills, decisions] = await Promise.all([
    getState(),
    getOpenPositions(),
    recentFills(50),
    recentDecisions(50),
  ]);
  res.json({ state, positions, fills, decisions, live: liveStatus() });
});

router.get('/duel/state', async (_req: Request, res: Response) => {
  res.json(await publicDuelState());
});

router.get('/duel/pairs', (_req: Request, res: Response) => {
  res.json({ active: duelState.pair, pairs: ARENA_PAIRS, strategies: ARENA_STRATEGIES });
});

router.get('/duel/scoreboard', async (_req: Request, res: Response) => {
  try {
    res.json(await buildArenaScoreboard());
  } catch (error: any) {
    res.status(500).json({
      error: error?.message || 'arena scoreboard failed',
      sources: {
        birdeyeConfigured: Boolean(process.env.BIRDEYE_API_KEY),
        heliusConfigured: Boolean(process.env.HELIUS_RPC_URL || process.env.HELIUS_API_KEY),
      },
    });
  }
});

router.post('/duel/start', async (_req: Request, res: Response) => {
  duelState.running = true;
  pushDuelLog('info', 'DeepSeek vs Grok vs MiniMax vs Kimi 4-way arena started.');
  res.json(await publicDuelState());
});

router.post('/duel/pause', async (_req: Request, res: Response) => {
  duelState.running = false;
  pushDuelLog('info', 'Arena duel paused.');
  res.json(await publicDuelState());
});

router.post('/duel/reset', async (_req: Request, res: Response) => {
  duelState.running = false;
  duelState.round = 0;
  duelState.price = duelState.pair.startPrice;
  duelState.history = [duelState.pair.startPrice];
  duelState.trades = [];
  duelOodaStates.deepseek = createState();
  duelOodaStates.xai = createState();
  duelOodaStates.minimax = createState();
  duelOodaStates.openrouter = createState();
  for (const agent of duelState.agents) {
    agent.cashUsd = 1_000;
    agent.baseTokens = 0;
    agent.pnlUsd = 0;
    agent.lastAction = 'hold';
    agent.status = 'ready';
    agent.lastThought = 'Reset and waiting for the next opening print.';
  }
  pushDuelLog('info', 'Arena duel reset.');
  res.json(await publicDuelState());
});

router.post('/duel/pair', async (req: Request, res: Response) => {
  const symbol = String(req.body?.symbol || '').toUpperCase();
  const pair = ARENA_PAIRS.find((item) => item.symbol === symbol);
  if (!pair) return res.status(400).json({ error: 'unsupported arena pair', pairs: ARENA_PAIRS });
  duelState.running = false;
  duelState.round = 0;
  duelState.pair = pair;
  duelState.price = pair.startPrice;
  duelState.history = [pair.startPrice];
  duelState.trades = [];
  duelOodaStates.deepseek = createState();
  duelOodaStates.xai = createState();
  duelOodaStates.minimax = createState();
  duelOodaStates.openrouter = createState();
  for (const agent of duelState.agents) {
    agent.cashUsd = 1_000;
    agent.baseTokens = 0;
    agent.pnlUsd = 0;
    agent.lastAction = 'hold';
    agent.status = 'ready';
    agent.lastThought = `Switched to ${pair.name}; waiting for the next opening print.`;
  }
  scoreboardCache.clear();
  pushDuelLog('info', `Arena pair switched to ${pair.name}.`);
  res.json(await publicDuelState());
});

router.post('/duel/tick', async (_req: Request, res: Response) => {
  try {
    res.json(await runDuelTick());
  } catch (error: any) {
    pushDuelLog('error', `Arena duel tick failed: ${error?.message || 'unknown error'}`);
    res.status(500).json({ error: error?.message || 'duel tick failed' });
  }
});

router.get('/recent-events', (_req: Request, res: Response) => {
  res.json({ events: clawdBus.recent() });
});

router.get('/pump-stream', (_req: Request, res: Response) => {
  res.json(heliusPumpStreamStatus());
});

const adminGuard = (req: Request, res: Response, next: NextFunction) => {
  if (isAdminSession(req)) return next();

  const expected = process.env.CLAWD_ADMIN_KEY;
  if (expected) {
    const provided = req.header('x-clawd-admin') ?? (req.body && (req.body as any).adminKey);
    if (provided === expected) return next();
  }
  return res.status(401).json({
    error: 'Unauthorized',
    hint: 'Sign in with a wallet listed in CLAWD_ADMIN_WALLETS, or provide x-clawd-admin matching CLAWD_ADMIN_KEY.',
  });
};

router.get('/templates', (_req: Request, res: Response) => {
  const list = loadTemplates().map((t) => ({
    templateId: t.templateId,
    templateName: t.templateName,
    templateDescription: t.templateDescription,
    templateCategory: t.templateCategory,
    templateAvatar: t.templateAvatar,
    variableCount: t.variables.length,
    requiredCount: t.variables.filter((v) => v.required).length,
  }));
  res.json({ templates: list });
});

router.get('/starter-agents', (_req: Request, res: Response) => {
  const payload = loadBrowserAgents();
  res.json({
    importedAt: payload.importedAt,
    count: payload.starters.count,
    agents: payload.starters.agents.map((agent) => ({
      id: agent.id,
      title: agent.title,
      description: agent.description,
      category: agent.category,
      avatar: agent.avatar,
      tags: agent.tags,
      featured: agent.featured,
      oneShot: agent.oneShot,
      tokenUsage: agent.tokenUsage,
      capabilities: agent.capabilities,
      metaplexSkills: agent.metaplexSkills,
      runtimeProfile: getImportedAgentRuntimeProfile(agent),
      recommendation: deriveBrowserAgentRecommendation(agent, payload),
      platformContext: getPlatformContextForImportedAgent(agent),
      source: {
        homepage: agent.source.homepage,
        author: agent.source.author,
        createdAt: agent.source.createdAt,
      },
    })),
  });
});

router.get('/starter-agents/:id', (req: Request, res: Response) => {
  const agent = getBrowserAgent(String(req.params.id));
  if (!agent) return res.status(404).json({ error: 'starter agent not found' });
  const payload = loadBrowserAgents();
  res.json({
    ...agent,
    recommendation: deriveBrowserAgentRecommendation(agent, payload),
  });
});

router.get('/browser-agents', (_req: Request, res: Response) => {
  const payload = loadBrowserAgents();
  res.json({
    importedAt: payload.importedAt,
    sourceRoot: payload.sourceRoot,
    catalogMeta: payload.catalogMeta,
    manifest: payload.manifest,
    clawd: payload.clawd,
    docs: payload.docs,
    locales: payload.locales,
    wellKnown: payload.wellKnown,
    projects: payload.projects,
    skills: payload.skills,
    count: payload.agents.length,
    agents: payload.agents.map((agent) => ({
      ...agent,
      runtimeProfile: getImportedAgentRuntimeProfile(agent),
      recommendation: deriveBrowserAgentRecommendation(agent, payload),
      platformContext: getPlatformContextForImportedAgent(agent),
    })),
  });
});

router.get('/browser-agents/:id', (req: Request, res: Response) => {
  const agent = getBrowserAgent(String(req.params.id));
  if (!agent) return res.status(404).json({ error: 'browser agent not found' });
  const payload = loadBrowserAgents();
  res.json({
    ...agent,
    runtimeProfile: getImportedAgentRuntimeProfile(agent),
    recommendation: deriveBrowserAgentRecommendation(agent, payload),
    repoAssets: getRelevantRepoAssetsForImportedAgent(agent),
    platformContext: getPlatformContextForImportedAgent(agent),
  });
});

router.get('/browser-agents/runtime-live', async (_req: Request, res: Response) => {
  const payload = loadBrowserAgents();
  const liveAgents = await Promise.all(
    payload.agents.map(async (agent) => ({
      id: agent.id,
      title: agent.title,
      runtimeProfile: getImportedAgentRuntimeProfile(agent),
      recommendation: deriveBrowserAgentRecommendation(agent, payload),
      platformContext: getPlatformContextForImportedAgent(agent),
      live: await getImportedAgentLiveRuntime(agent.id),
    })),
  );

  res.json({
    importedAt: payload.importedAt,
    count: liveAgents.length,
    agents: liveAgents,
  });
});

router.get('/browser-agents/:id/adapter-status', async (req: Request, res: Response) => {
  const liveRuntime = await getImportedAgentLiveRuntime(String(req.params.id));
  if (!liveRuntime) return res.status(404).json({ error: 'browser agent not found' });
  res.json(liveRuntime.adapterStatus);
});

router.get('/browser-agents/:id/bridge', async (req: Request, res: Response) => {
  const liveRuntime = await getImportedAgentLiveRuntime(String(req.params.id));
  if (!liveRuntime) return res.status(404).json({ error: 'browser agent not found' });
  res.json(liveRuntime.bridge);
});

router.get('/browser-agents/:id/operational-data', async (req: Request, res: Response) => {
  const liveRuntime = await getImportedAgentLiveRuntime(String(req.params.id));
  if (!liveRuntime) return res.status(404).json({ error: 'browser agent not found' });
  res.json(liveRuntime.operationalData);
});

router.get('/browser-agent-templates', (_req: Request, res: Response) => {
  const payload = loadBrowserAgents();
  res.json({
    importedAt: payload.importedAt,
    count: payload.templates.length,
    templates: payload.templates.map((template) => ({
      id: template.id,
      filename: template.filename,
      description: template.description,
    })),
  });
});

router.get('/browser-agent-templates/:id', (req: Request, res: Response) => {
  const template = getBrowserAgentTemplate(String(req.params.id));
  if (!template) return res.status(404).json({ error: 'browser agent template not found' });
  res.json(template);
});

router.get('/browser-templates', (_req: Request, res: Response) => {
  const payload = loadBrowserAgents();
  res.json({
    importedAt: payload.importedAt,
    count: payload.browserTemplates.length,
    templates: payload.browserTemplates.map((template) => ({
      id: template.id,
      filename: template.filename,
      description: template.description,
    })),
  });
});

router.get('/browser-templates/:id', (req: Request, res: Response) => {
  const template = getBrowserTemplate(String(req.params.id));
  if (!template) return res.status(404).json({ error: 'browser template not found' });
  res.json(template);
});

router.get('/browser-characters', (_req: Request, res: Response) => {
  const payload = loadBrowserAgents();
  res.json({
    importedAt: payload.importedAt,
    count: payload.characters.length,
    characters: payload.characters.map((character) => ({
      id: character.id,
      name: character.name,
      bio: character.bio,
      adjectives: character.adjectives,
      topics: character.topics,
    })),
  });
});

router.get('/browser-characters/:id', (req: Request, res: Response) => {
  const character = getBrowserCharacter(String(req.params.id));
  if (!character) return res.status(404).json({ error: 'browser character not found' });
  res.json(character);
});

router.get('/browser-skills', (_req: Request, res: Response) => {
  const payload = loadBrowserAgents();
  res.json({
    importedAt: payload.importedAt,
    count: payload.skills.length,
    skills: payload.skills,
  });
});

router.get('/browser-docs', (_req: Request, res: Response) => {
  const payload = loadBrowserAgents();
  res.json({
    importedAt: payload.importedAt,
    count: payload.docs.length,
    docs: payload.docs,
  });
});

router.get('/browser-repo-assets', (_req: Request, res: Response) => {
  const payload = loadBrowserAgents();
  res.json({
    importedAt: payload.importedAt,
    repoAssets: payload.repoAssets,
  });
});

router.get('/browser-locales', (_req: Request, res: Response) => {
  const payload = loadBrowserAgents();
  res.json({
    importedAt: payload.importedAt,
    count: payload.locales.length,
    locales: payload.locales,
  });
});

router.get('/browser-locales/:id', (req: Request, res: Response) => {
  const locale = getBrowserLocale(String(req.params.id));
  if (!locale) return res.status(404).json({ error: 'browser locale not found' });
  res.json(locale);
});

router.get('/browser-well-known', (_req: Request, res: Response) => {
  const payload = loadBrowserAgents();
  res.json({
    importedAt: payload.importedAt,
    count: payload.wellKnown.length,
    records: payload.wellKnown,
  });
});

router.get('/browser-projects', (_req: Request, res: Response) => {
  const payload = loadBrowserAgents();
  res.json({
    importedAt: payload.importedAt,
    count: payload.projects.length,
    projects: payload.projects,
  });
});

router.get('/templates/:id', (req: Request, res: Response) => {
  const t = getTemplate(String(req.params.id));
  if (!t) return res.status(404).json({ error: 'template not found' });
  res.json(t);
});

router.post('/templates/:id/render', (req: Request, res: Response) => {
  const t = getTemplate(String(req.params.id));
  if (!t) return res.status(404).json({ error: 'template not found' });
  const values = ((req.body as any)?.values ?? {}) as Record<string, string>;
  const userHandle =
    sessionWallet(req)
      ? `${sessionWallet(req)!.slice(0, 4)}…${sessionWallet(req)!.slice(-4)}`
      : 'anonymous';
  const result = renderTemplate(t, values, { userHandle });
  res.json(result);
});

router.get('/admin/whoami', (req: Request, res: Response) => {
  res.json({
    sessionWallet: sessionWallet(req),
    isAdmin: isAdminSession(req),
    keyConfigured: !!process.env.CLAWD_ADMIN_KEY,
    adminWalletsCount: adminWalletList().length,
  });
});

router.post('/control/start', adminGuard, async (_req: Request, res: Response) => {
  await startRunner();
  res.json({ ok: true, state: await getState() });
});

router.post('/control/stop', adminGuard, async (_req: Request, res: Response) => {
  await stopRunner();
  res.json({ ok: true, state: await getState() });
});

router.post('/control/tick', adminGuard, async (_req: Request, res: Response) => {
  await forceTick();
  res.json({ ok: true });
});

router.post('/control/mode', adminGuard, async (req: Request, res: Response) => {
  const mode = String((req.body as any).mode ?? '');
  if (!['solana', 'hyperliquid'].includes(mode)) {
    return res.status(400).json({ error: 'mode must be solana|hyperliquid' });
  }
  if (process.env.CLAWD_LIVE !== 'true') {
    return res.status(403).json({ error: 'Live mode requires CLAWD_LIVE=true' });
  }
  const state = await updateState({ mode: mode as any });
  res.json({ ok: true, state });
});

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const LAMPORTS_PER_SOL = 1_000_000_000;
const VIEWER_MAX_NOTIONAL_USD = 5;
const MIRROR_MAX_AGE_MS = 5 * 60 * 1000;

const sessionGuard = (req: Request, res: Response, next: NextFunction) => {
  if (!isAuthenticatedSession(req) || !sessionWallet(req)) {
    return res.status(401).json({ error: 'Sign in with your wallet first.' });
  }
  next();
};

router.get('/mirror/feed', async (_req: Request, res: Response) => {
  if (!db) return res.json({ mirrors: [] });
  try {
    await ensureClawdTables();
    const rows: any = await db.execute(sql`
      SELECT id, ts, wallet_address, source_fill_id, symbol, mint, side, amount_in_raw, amount_out, notional_usd, tx_signature, status
      FROM clawd_mirror_actions ORDER BY ts DESC LIMIT 50
    `);
    const list = rows.rows ?? rows ?? [];
    const masked = list.map((r: any) => ({
      id: r.id,
      ts: new Date(r.ts).getTime(),
      wallet: `${String(r.wallet_address).slice(0, 4)}…${String(r.wallet_address).slice(-4)}`,
      sourceFillId: r.source_fill_id,
      symbol: r.symbol,
      mint: r.mint,
      side: r.side,
      amountOut: r.amount_out != null ? Number(r.amount_out) : null,
      notionalUsd: r.notional_usd != null ? Number(r.notional_usd) : null,
      txSignature: r.tx_signature,
      status: r.status,
    }));
    res.json({ mirrors: masked });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? 'feed error' });
  }
});

router.get('/mirror/quote', sessionGuard, async (req: Request, res: Response) => {
  const fillId = Number(req.query.fillId);
  const taker = sessionWallet(req)!;
  if (!fillId) return res.status(400).json({ error: 'fillId required' });

  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  await ensureClawdTables();

  let fill: any;
  try {
    const rows: any = await db.execute(sql`SELECT * FROM clawd_fills WHERE id = ${fillId}`);
    fill = rows.rows?.[0] ?? rows[0];
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? 'fill lookup failed' });
  }
  if (!fill) return res.status(404).json({ error: 'fill not found' });
  const fillTs = new Date(fill.ts).getTime();
  if (Date.now() - fillTs > MIRROR_MAX_AGE_MS) {
    return res.status(410).json({ error: 'fill too old to mirror' });
  }

  const requestedUsd = Number(req.query.notionalUsd ?? VIEWER_MAX_NOTIONAL_USD);
  const notionalUsd = Math.min(Math.max(requestedUsd, 0.5), VIEWER_MAX_NOTIONAL_USD);

  let solUsd = 150;
  if (process.env.BIRDEYE_API_KEY) {
    try {
      const r = await fetch(`https://public-api.birdeye.so/defi/price?address=${SOL_MINT}`, {
        headers: { 'x-api-key': process.env.BIRDEYE_API_KEY!, accept: 'application/json', 'x-chain': 'solana' },
      });
      if (r.ok) {
        const d: any = await r.json();
        solUsd = d?.data?.value ?? 150;
      }
    } catch {}
  }

  const isBuy = fill.side === 'buy';
  const fillMint = String(fill.mint || (await mintForSymbol(fill.symbol)) || '');
  if (!fillMint) {
    return res.status(400).json({ error: 'Fill missing mint metadata.' });
  }

  let inputMint: string;
  let outputMint: string;
  let amountRaw: number;
  let inputDecimals = 9;

  if (isBuy) {
    inputMint = SOL_MINT;
    outputMint = fillMint;
    amountRaw = Math.floor((notionalUsd / solUsd) * LAMPORTS_PER_SOL);
    if (amountRaw < 1000) return res.status(400).json({ error: 'amount too small' });
  } else {
    inputMint = fillMint;
    outputMint = SOL_MINT;
    const dec = await getMintDecimals(fillMint);
    if (dec == null) return res.status(502).json({ error: 'decimals lookup failed' });
    inputDecimals = dec;

    const holdings = await viewerHoldings(taker, fillMint);
    if (holdings <= 0) {
      return res.status(400).json({ error: 'You have no mirrored position in this token.' });
    }
    const explicit = req.query.amount ? Number(req.query.amount) : null;
    const sellTokens = explicit && explicit > 0 ? Math.min(explicit, holdings) : holdings;
    amountRaw = Math.floor(sellTokens * 10 ** dec);
    if (amountRaw <= 0) return res.status(400).json({ error: 'amount too small after decimals' });
  }

  try {
    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount: String(amountRaw),
      taker,
      slippageBps: '100',
    });
    const r = await fetch(`https://api.jup.ag/swap/v2/order?${params}`, {
      headers: process.env.JUPITER_API_KEY ? { 'x-api-key': process.env.JUPITER_API_KEY } : {},
    });
    if (!r.ok) return res.status(502).json({ error: `jupiter order ${r.status}` });
    const order: any = await r.json();
    res.json({
      order,
      side: isBuy ? 'buy' : 'sell',
      inputMint,
      outputMint,
      inputDecimals,
      amountRaw,
      notionalUsd: isBuy ? notionalUsd : null,
      solUsd,
      sourceFillId: fill.id,
      symbol: fill.symbol,
      mint: fillMint,
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? 'quote failed' });
  }
});

async function viewerHoldings(wallet: string, mint: string): Promise<number> {
  if (!db) return 0;
  try {
    await ensureClawdTables();
    const rows: any = await db.execute(sql`
      SELECT side, COALESCE(SUM(amount_out), 0) AS sum_out
      FROM clawd_mirror_actions
      WHERE wallet_address = ${wallet} AND mint = ${mint} AND status = 'submitted'
      GROUP BY side
    `);
    const list = rows.rows ?? rows ?? [];
    let bought = 0;
    let sold = 0;
    for (const r of list) {
      const v = Number(r.sum_out ?? 0);
      if (r.side === 'buy') bought += v;
      else if (r.side === 'sell') sold += v;
    }
    return Math.max(0, bought - sold);
  } catch {
    return 0;
  }
}

async function mintForSymbol(symbol: string): Promise<string | null> {
  if (symbol === 'SOL') return SOL_MINT;
  if (symbol === 'CLAWD') return '8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump';
  return null;
}

router.get('/mirror/holdings/:wallet', async (req: Request, res: Response) => {
  const wallet = String(req.params.wallet);
  if (!db) return res.json({ holdings: [], realizedPnlUsd: 0, totalSpentUsd: 0 });
  try {
    await ensureClawdTables();
    const rows: any = await db.execute(sql`
      SELECT mint, symbol, side,
        COALESCE(SUM(amount_out), 0) AS sum_out,
        COALESCE(SUM(notional_usd), 0) AS sum_usd
      FROM clawd_mirror_actions
      WHERE wallet_address = ${wallet} AND status = 'submitted'
      GROUP BY mint, symbol, side
    `);
    const list = rows.rows ?? rows ?? [];
    type Agg = {
      mint: string;
      symbol: string;
      bought: number;
      sold: number;
      boughtNotionalUsd: number;
      soldNotionalUsd: number;
    };
    const byMint: Record<string, Agg> = {};
    for (const r of list) {
      const k = String(r.mint);
      if (!byMint[k]) byMint[k] = { mint: k, symbol: String(r.symbol), bought: 0, sold: 0, boughtNotionalUsd: 0, soldNotionalUsd: 0 };
      const qty = Number(r.sum_out ?? 0);
      const usd = Number(r.sum_usd ?? 0);
      if (r.side === 'buy') {
        byMint[k].bought = qty;
        byMint[k].boughtNotionalUsd = usd;
      } else if (r.side === 'sell') {
        byMint[k].sold = qty;
        byMint[k].soldNotionalUsd = usd;
      }
    }

    let realizedPnlUsd = 0;
    let totalSpentUsd = 0;

    const holdings = Object.values(byMint)
      .map((h) => {
        const net = Math.max(0, h.bought - h.sold);
        const avgBuyPrice = h.bought > 0 ? h.boughtNotionalUsd / h.bought : 0;
        const costBasisRemainingUsd = net * avgBuyPrice;
        const realizedForMint = h.soldNotionalUsd - h.sold * avgBuyPrice;
        realizedPnlUsd += realizedForMint;
        totalSpentUsd += h.boughtNotionalUsd;
        return {
          mint: h.mint,
          symbol: h.symbol,
          net,
          bought: h.bought,
          sold: h.sold,
          boughtNotionalUsd: h.boughtNotionalUsd,
          soldNotionalUsd: h.soldNotionalUsd,
          avgBuyPrice,
          costBasisRemainingUsd,
          realizedPnlUsd: realizedForMint,
          netNotionalUsd: h.boughtNotionalUsd - h.soldNotionalUsd,
        };
      })
      .filter((h) => h.net > 0 || h.sold > 0);

    res.json({
      holdings: holdings.filter((h) => h.net > 0),
      closed: holdings.filter((h) => h.net <= 0),
      realizedPnlUsd,
      totalSpentUsd,
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? 'holdings failed' });
  }
});

router.post('/mirror/record', sessionGuard, async (req: Request, res: Response) => {
  const wallet = req.session!.walletAddress!;
  const body = req.body as any;
  const { sourceFillId, txSignature, mint, symbol, side, amountInRaw, amountOut, notionalUsd } = body;

  if (!txSignature || !mint || !symbol || !side || amountInRaw == null) {
    return res.status(400).json({ error: 'missing required fields' });
  }
  if (!['buy', 'sell'].includes(String(side))) {
    return res.status(400).json({ error: 'side must be buy|sell' });
  }
  if (!db) return res.status(503).json({ error: 'DB unavailable' });

  try {
    await ensureClawdTables();
    const ins: any = await db.execute(sql`
      INSERT INTO clawd_mirror_actions
        (wallet_address, source_fill_id, symbol, mint, side, amount_in_raw, amount_out, notional_usd, tx_signature, status)
      VALUES
        (${wallet}, ${sourceFillId ?? null}, ${symbol}, ${mint}, ${side},
         ${String(amountInRaw)}::numeric, ${amountOut ?? null}, ${notionalUsd ?? null}, ${txSignature}, 'submitted')
      ON CONFLICT (tx_signature) DO NOTHING
      RETURNING id, ts
    `);
    const row = ins.rows?.[0] ?? ins[0];
    if (!row) {
      return res.json({ ok: true, alreadyRecorded: true });
    }

    clawdBus.publish({
      type: 'log',
      payload: {
        level: 'info',
        msg: `🔁 ${wallet.slice(0, 4)}…${wallet.slice(-4)} mirrored ${side.toUpperCase()} ${symbol} (${notionalUsd ? `$${Number(notionalUsd).toFixed(2)}` : ''})`,
      },
    });
    clawdBus.publish({
      type: 'log',
      payload: {
        level: 'info',
        msg: `mirror tx: https://solscan.io/tx/${txSignature}`,
      },
    });

    // Persist trade to Honcho (fire-and-forget)
    honchoLogTrade(wallet, {
      symbol,
      mint,
      side: side as 'buy' | 'sell',
      amountInRaw,
      amountOut: amountOut ?? null,
      notionalUsd: notionalUsd ?? null,
      txSignature,
      source: 'mirror',
    }).catch(() => {});

    res.json({ ok: true, id: row.id, ts: row.ts });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? 'record failed' });
  }
});

export function attachArenaWebSocket(httpServer: Server) {
  const wss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false,
  });

  wss.on('error', (err) => {
    console.warn('[clawd-ws] server error:', (err as any)?.code || err?.message);
  });

  wss.on('connection', (ws) => {
    const send = (data: any) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(data));
    };

    ws.on('error', (err) => {
      console.warn('[clawd-ws] client error:', (err as any)?.code || err?.message);
    });

    Promise.all([getState(), getOpenPositions(), recentFills(50), recentDecisions(50)])
      .then(([state, positions, fills, decisions]) => {
        send({ type: 'hello', payload: { state, positions, fills, decisions, recent: clawdBus.recent() } });
      })
      .catch(() => {});

    const unsub = clawdBus.subscribe((ev) => send(ev));
    ws.on('close', () => unsub());
  });

  return wss;
}

export default router;
