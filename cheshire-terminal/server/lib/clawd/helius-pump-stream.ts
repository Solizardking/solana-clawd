import WebSocket from 'ws';
import { clawdBus } from './bus';

const PUMP_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const PUMP_AMM_PROGRAM_ID = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA';

const INITIAL_RECONNECT_MS = 1_000;
const MAX_RECONNECT_MS = 30_000;

let ws: WebSocket | null = null;
let started = false;
let reconnectTimer: NodeJS.Timeout | null = null;
let pingTimer: NodeJS.Timeout | null = null;
let reconnectDelay = INITIAL_RECONNECT_MS;
let subscriptionId: number | string | null = null;
let lastMessageAt = 0;

function heliusWssUrl(): string | null {
  if (process.env.HELIUS_WSS_URL) return process.env.HELIUS_WSS_URL;
  if (process.env.HELIUS_API_KEY) {
    return `wss://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
  }
  const rpc = process.env.HELIUS_RPC_URL;
  if (rpc?.startsWith('https://mainnet.helius-rpc.com')) {
    return rpc.replace(/^https:/, 'wss:');
  }
  return null;
}

function publishLog(level: 'info' | 'warn' | 'error', msg: string) {
  clawdBus.publish({ type: 'log', payload: { level, msg } });
}

function clearTimers() {
  if (pingTimer) clearInterval(pingTimer);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  pingTimer = null;
  reconnectTimer = null;
}

function compactPumpTransaction(result: any) {
  const tx = result?.transaction;
  const meta = tx?.meta;
  const message = tx?.transaction?.message;
  const accountKeys = Array.isArray(message?.accountKeys)
    ? message.accountKeys.map((key: any) => (typeof key === 'string' ? key : key?.pubkey)).filter(Boolean)
    : [];
  const instructions = Array.isArray(message?.instructions)
    ? message.instructions.map((ix: any) => ({
        programId: ix?.programId,
        accounts: Array.isArray(ix?.accounts) ? ix.accounts.slice(0, 12) : [],
      }))
    : [];
  const logs = Array.isArray(meta?.logMessages) ? meta.logMessages : [];
  const venue = accountKeys.includes(PUMP_AMM_PROGRAM_ID) || instructions.some((ix: any) => ix.programId === PUMP_AMM_PROGRAM_ID)
    ? 'pumpswap'
    : 'pump';

  return {
    source: 'helius',
    venue,
    signature: result?.signature,
    slot: result?.slot,
    err: meta?.err ?? null,
    fee: meta?.fee,
    accountKeys: accountKeys.slice(0, 32),
    instructions,
    logs: logs.slice(-12),
  };
}

function scheduleReconnect() {
  if (!started || reconnectTimer) return;
  const delay = reconnectDelay;
  reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_MS);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function sendSubscribe(socket: WebSocket) {
  socket.send(JSON.stringify({
    jsonrpc: '2.0',
    id: 420,
    method: 'transactionSubscribe',
    params: [
      {
        failed: false,
        accountInclude: [PUMP_PROGRAM_ID, PUMP_AMM_PROGRAM_ID],
      },
      {
        commitment: 'processed',
        encoding: 'jsonParsed',
        transactionDetails: 'full',
        maxSupportedTransactionVersion: 0,
      },
    ],
  }));
}

function connect() {
  const url = heliusWssUrl();
  if (!url) {
    publishLog('warn', '[helius-pump-stream] HELIUS_API_KEY/HELIUS_WSS_URL missing; Pump stream disabled');
    return;
  }

  ws = new WebSocket(url);

  ws.on('open', () => {
    reconnectDelay = INITIAL_RECONNECT_MS;
    lastMessageAt = Date.now();
    sendSubscribe(ws!);
    publishLog('info', '[helius-pump-stream] connected to Helius Pump transaction stream');
    pingTimer = setInterval(() => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.ping();
      if (Date.now() - lastMessageAt > 120_000) {
        publishLog('warn', '[helius-pump-stream] no messages for 120s; reconnecting');
        ws.terminate();
      }
    }, 30_000);
  });

  ws.on('message', (raw) => {
    lastMessageAt = Date.now();
    let msg: any;
    try {
      msg = JSON.parse(raw.toString('utf8'));
    } catch {
      return;
    }

    if (msg.id === 420 && msg.result !== undefined) {
      subscriptionId = msg.result;
      publishLog('info', `[helius-pump-stream] subscribed (${subscriptionId})`);
      return;
    }

    const result = msg?.params?.result;
    if (!result) return;
    const event = compactPumpTransaction(result);
    clawdBus.publish({ type: 'pump_stream', payload: event });
  });

  ws.on('error', (err) => {
    publishLog('error', `[helius-pump-stream] websocket error: ${err.message}`);
  });

  ws.on('close', () => {
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = null;
    ws = null;
    subscriptionId = null;
    if (started) scheduleReconnect();
  });
}

export function startHeliusPumpStream() {
  if (started || process.env.HELIUS_PUMP_STREAM_ENABLED === 'false') return;
  started = true;
  connect();
}

export function stopHeliusPumpStream() {
  started = false;
  clearTimers();
  ws?.close();
  ws = null;
}

export function heliusPumpStreamStatus() {
  return {
    enabled: started,
    connected: ws?.readyState === WebSocket.OPEN,
    subscriptionId,
    lastMessageAt,
    programs: [PUMP_PROGRAM_ID, PUMP_AMM_PROGRAM_ID],
  };
}
