import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { Connection, PublicKey } from '@solana/web3.js';
import { getPriceFromSqrtPrice } from '@meteora-ag/cp-amm-sdk';
import { getRpcUrl, getCpAmm, CLAWD_MINT, SOL_MINT, CLAWD_DECIMALS, SOL_DECIMALS, CLAWD_VAULT, SOL_VAULT, getConnection } from './pool-client';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PriceUpdate {
  poolAddress: string;
  clawdPerSol: number;
  solPerClawd: number;
  clawdReserve: number;
  solReserve: number;
  timestamp: number;
  source: 'ws' | 'poll';
}

// ── Helius WebSocket Price Monitor ────────────────────────────────────────────

export class ClawdPoolPriceMonitor extends EventEmitter {
  private ws: WebSocket | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private subscriptionId: number | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 2000;
  private readonly maxReconnectDelay = 30_000;
  private destroyed = false;

  constructor(private readonly poolAddress: string) {
    super();
  }

  start() {
    this.connectWs();
    // Fallback polling every 15s in case WS drops
    this.pollTimer = setInterval(() => this.poll(), 15_000);
  }

  stop() {
    this.destroyed = true;
    if (this.ws) {
      try { this.ws.close(); } catch { /* */ }
      this.ws = null;
    }
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
  }

  private getWssUrl(): string {
    if (process.env.HELIUS_WSS_URL) return process.env.HELIUS_WSS_URL;
    const key = process.env.HELIUS_API_KEY;
    return key
      ? `wss://mainnet.helius-rpc.com/?api-key=${key}`
      : 'wss://api.mainnet-beta.solana.com';
  }

  private connectWs() {
    if (this.destroyed) return;
    const url = this.getWssUrl();
    try {
      this.ws = new WebSocket(url);

      this.ws.on('open', () => {
        this.reconnectDelay = 2000;
        this.subscribeToPool();
      });

      this.ws.on('message', (data: WebSocket.RawData) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleMessage(msg);
        } catch { /* */ }
      });

      this.ws.on('error', () => { /* swallow, reconnect handles it */ });

      this.ws.on('close', () => {
        if (!this.destroyed) this.scheduleReconnect();
      });
    } catch {
      if (!this.destroyed) this.scheduleReconnect();
    }
  }

  private subscribeToPool() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const req = {
      jsonrpc: '2.0',
      id: 1,
      method: 'accountSubscribe',
      params: [
        this.poolAddress,
        { encoding: 'base64', commitment: 'confirmed' },
      ],
    };
    this.ws.send(JSON.stringify(req));
  }

  private handleMessage(msg: any) {
    // Capture subscription ID
    if (msg.id === 1 && typeof msg.result === 'number') {
      this.subscriptionId = msg.result;
      return;
    }

    // Account change notification
    if (msg.method === 'accountNotification') {
      this.poll(); // Re-fetch pool state on any pool account change
    }
  }

  private scheduleReconnect() {
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      this.connectWs();
    }, this.reconnectDelay);
  }

  async poll() {
    try {
      const cpAmm = getCpAmm();
      const connection = getConnection();
      const state = await cpAmm.fetchPoolState(new PublicKey(this.poolAddress)) as any;

      // Resolve vault addresses from pool state, fall back to known constants
      const isClawd_A = state.tokenAMint?.toString() === CLAWD_MINT.toString();
      const clawdVault: PublicKey = isClawd_A
        ? (state.tokenAVault as PublicKey ?? CLAWD_VAULT)
        : (state.tokenBVault as PublicKey ?? CLAWD_VAULT);
      const solVault: PublicKey = isClawd_A
        ? (state.tokenBVault as PublicKey ?? SOL_VAULT)
        : (state.tokenAVault as PublicKey ?? SOL_VAULT);

      // Read actual reserve balances from vault token accounts
      let clawdReserve = 0;
      let solReserve = 0;
      try {
        const [clawdBal, solBal] = await Promise.all([
          connection.getTokenAccountBalance(clawdVault),
          connection.getTokenAccountBalance(solVault),
        ]);
        clawdReserve = Number(clawdBal.value.uiAmount ?? 0);
        solReserve   = Number(solBal.value.uiAmount ?? 0);
      } catch (e) {
        console.warn('[meteora-ws] vault balance error:', e);
      }

      // Derive price from sqrtPrice (returns SOL per CLAWD as Decimal)
      let clawdPerSol = 0;
      let solPerClawd = 0;
      try {
        if (state.sqrtPrice) {
          const priceDecimal = getPriceFromSqrtPrice(state.sqrtPrice, CLAWD_DECIMALS, SOL_DECIMALS);
          solPerClawd = priceDecimal.toNumber();
          clawdPerSol = solPerClawd > 0 ? 1 / solPerClawd : 0;
        }
      } catch {
        // Fallback to reserve ratio
        clawdPerSol = solReserve > 0 ? clawdReserve / solReserve : 0;
        solPerClawd = clawdReserve > 0 ? solReserve / clawdReserve : 0;
      }

      const update: PriceUpdate = {
        poolAddress: this.poolAddress,
        clawdPerSol,
        solPerClawd,
        clawdReserve,
        solReserve,
        timestamp: Date.now(),
        source: 'ws',
      };

      this.emit('price', update);
    } catch (err) {
      console.error('[meteora-ws] poll error:', err);
    }
  }
}

// ── Singleton Monitor ──────────────────────────────────────────────────────────

let _monitor: ClawdPoolPriceMonitor | null = null;
let _latestPrice: PriceUpdate | null = null;

export function startPriceMonitor(poolAddress: string): ClawdPoolPriceMonitor {
  if (_monitor) {
    _monitor.stop();
  }
  _monitor = new ClawdPoolPriceMonitor(poolAddress);
  _monitor.on('price', (update: PriceUpdate) => {
    _latestPrice = update;
  });
  _monitor.start();
  return _monitor;
}

export function getLatestPrice(): PriceUpdate | null {
  return _latestPrice;
}

export function getMonitor(): ClawdPoolPriceMonitor | null {
  return _monitor;
}
