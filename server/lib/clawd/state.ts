import { db } from '../../db';
import { sql } from 'drizzle-orm';
import type { AgentMode, AgentStatus, Fill, Position } from './types';

export interface ClawdState {
  status: AgentStatus;
  mode: AgentMode;
  cashUsd: number;
  totalPnlUsd: number;
  totalFills: number;
  lastTick: number | null;
}

function resolveDefaultMode(): AgentMode {
  const configuredMode = process.env.ARENA_TRADING_MODE || process.env.CLAWD_TRADING_MODE;
  if (configuredMode === 'solana' || configuredMode === 'hyperliquid') return configuredMode;
  return process.env.CLAWD_LIVE === 'true' && !!process.env.CLAWD_TRADER_KEY
    ? 'solana'
    : 'solana';
}

function createFallbackState(): ClawdState {
  return {
    status: 'idle',
    mode: resolveDefaultMode(),
    cashUsd: 10000,
    totalPnlUsd: 0,
    totalFills: 0,
    lastTick: null,
  };
}

const memFallback: ClawdState = createFallbackState();
let ensureTablesPromise: Promise<void> | null = null;

function syncFallbackDefaults() {
  memFallback.mode = resolveDefaultMode();
}

syncFallbackDefaults();

export async function ensureClawdTables(): Promise<void> {
  if (!db) return;
  if (ensureTablesPromise) return ensureTablesPromise;

  ensureTablesPromise = (async () => {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS clawd_state (
        id integer PRIMARY KEY,
        status text NOT NULL,
        mode text NOT NULL,
        cash_usd numeric NOT NULL DEFAULT 10000,
        total_pnl_usd numeric NOT NULL DEFAULT 0,
        total_fills integer NOT NULL DEFAULT 0,
        last_tick timestamptz
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS clawd_decisions (
        id serial PRIMARY KEY,
        ts timestamptz NOT NULL DEFAULT now(),
        venue text NOT NULL,
        symbol text NOT NULL,
        signal text NOT NULL,
        signal_score numeric NOT NULL DEFAULT 0,
        signal_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
        gate_action text NOT NULL,
        gate_reasoning text NOT NULL,
        outcome text
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS clawd_fills (
        id serial PRIMARY KEY,
        ts timestamptz NOT NULL DEFAULT now(),
        venue text NOT NULL,
        symbol text NOT NULL,
        side text NOT NULL,
        size numeric NOT NULL,
        price numeric NOT NULL,
        notional_usd numeric NOT NULL,
        pnl_usd numeric,
        mode text NOT NULL,
        tx_signature text,
        decision_id integer
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS clawd_positions (
        id serial PRIMARY KEY,
        venue text NOT NULL,
        symbol text NOT NULL,
        side text NOT NULL,
        size numeric NOT NULL,
        entry_price numeric NOT NULL,
        current_price numeric,
        pnl_usd numeric NOT NULL DEFAULT 0,
        opened_at timestamptz NOT NULL DEFAULT now(),
        closed_at timestamptz
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS clawd_mirror_actions (
        id serial PRIMARY KEY,
        ts timestamptz NOT NULL DEFAULT now(),
        wallet_address text NOT NULL,
        source_fill_id integer NOT NULL,
        symbol text NOT NULL,
        mint text NOT NULL,
        side text NOT NULL,
        amount_in_raw numeric,
        amount_out numeric,
        notional_usd numeric,
        tx_signature text,
        status text NOT NULL DEFAULT 'submitted'
      )
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS clawd_mirror_actions_tx_signature_idx
      ON clawd_mirror_actions (tx_signature)
      WHERE tx_signature IS NOT NULL
    `);
    await db.execute(sql`
      INSERT INTO clawd_state (id, status, mode, cash_usd, total_pnl_usd, total_fills, last_tick)
      VALUES (1, 'idle', ${resolveDefaultMode()}, 10000, 0, 0, null)
      ON CONFLICT (id) DO NOTHING
    `);
  })().catch((error) => {
    ensureTablesPromise = null;
    throw error;
  });

  return ensureTablesPromise;
}

export async function getState(): Promise<ClawdState> {
  syncFallbackDefaults();
  if (!db) return { ...memFallback };
  try {
    await ensureClawdTables();
    const rows = await db.execute(sql`SELECT * FROM clawd_state WHERE id = 1`);
    const r: any = (rows as any).rows?.[0] ?? (rows as any)[0];
    if (!r) return { ...memFallback };
    const mode = ['solana', 'hyperliquid'].includes(r.mode) ? r.mode : resolveDefaultMode();
    return {
      status: r.status,
      mode,
      cashUsd: Number(r.cash_usd),
      totalPnlUsd: Number(r.total_pnl_usd),
      totalFills: Number(r.total_fills),
      lastTick: r.last_tick ? new Date(r.last_tick).getTime() : null,
    };
  } catch {
    return { ...memFallback };
  }
}

export async function updateState(patch: Partial<ClawdState>): Promise<ClawdState> {
  const cur = await getState();
  const next = { ...cur, ...patch };
  if (db) {
    try {
      await ensureClawdTables();
      await db.execute(sql`
        UPDATE clawd_state SET
          status = ${next.status},
          mode = ${next.mode},
          cash_usd = ${next.cashUsd},
          total_pnl_usd = ${next.totalPnlUsd},
          total_fills = ${next.totalFills},
          last_tick = ${next.lastTick ? new Date(next.lastTick).toISOString() : null}
        WHERE id = 1
      `);
    } catch (e) {
      console.warn('[clawd-state] update failed:', e);
    }
  }
  Object.assign(memFallback, next);
  return next;
}

export async function recordDecision(d: {
  venue: string;
  symbol: string;
  signal: string;
  signalScore: number;
  signalReasons: string[];
  gateAction: string;
  gateReasoning: string;
  outcome?: string;
}): Promise<number | null> {
  if (!db) return null;
  try {
    await ensureClawdTables();
    const rows: any = await db.execute(sql`
      INSERT INTO clawd_decisions (venue, symbol, signal, signal_score, signal_reasons, gate_action, gate_reasoning, outcome)
      VALUES (${d.venue}, ${d.symbol}, ${d.signal}, ${d.signalScore}, ${JSON.stringify(d.signalReasons)}::jsonb, ${d.gateAction}, ${d.gateReasoning}, ${d.outcome ?? null})
      RETURNING id
    `);
    return rows.rows?.[0]?.id ?? rows[0]?.id ?? null;
  } catch (e) {
    console.warn('[clawd-state] recordDecision failed:', e);
    return null;
  }
}

export async function recordFill(f: Fill): Promise<number | null> {
  if (!db) return null;
  try {
    await ensureClawdTables();
    const rows: any = await db.execute(sql`
      INSERT INTO clawd_fills (venue, symbol, side, size, price, notional_usd, pnl_usd, mode, tx_signature, decision_id)
      VALUES (${f.venue}, ${f.symbol}, ${f.side}, ${f.size}, ${f.price}, ${f.notionalUsd}, ${f.pnlUsd ?? null}, ${f.mode}, ${f.txSignature ?? null}, ${f.decisionId ?? null})
      RETURNING id
    `);
    return rows.rows?.[0]?.id ?? rows[0]?.id ?? null;
  } catch (e) {
    console.warn('[clawd-state] recordFill failed:', e);
    return null;
  }
}

export async function getOpenPositions(): Promise<Position[]> {
  if (!db) return [];
  try {
    await ensureClawdTables();
    const rows: any = await db.execute(sql`
      SELECT * FROM clawd_positions WHERE closed_at IS NULL ORDER BY opened_at DESC
    `);
    const list = rows.rows ?? rows ?? [];
    return list.map((r: any) => ({
      id: r.id,
      venue: r.venue,
      symbol: r.symbol,
      side: r.side,
      size: Number(r.size),
      entryPrice: Number(r.entry_price),
      currentPrice: r.current_price != null ? Number(r.current_price) : undefined,
      pnlUsd: Number(r.pnl_usd ?? 0),
      openedAt: new Date(r.opened_at).getTime(),
    }));
  } catch {
    return [];
  }
}

export async function openPosition(p: Omit<Position, 'id' | 'pnlUsd' | 'openedAt'>): Promise<Position | null> {
  if (!db) return null;
  try {
    await ensureClawdTables();
    const rows: any = await db.execute(sql`
      INSERT INTO clawd_positions (venue, symbol, side, size, entry_price, current_price, pnl_usd)
      VALUES (${p.venue}, ${p.symbol}, ${p.side}, ${p.size}, ${p.entryPrice}, ${p.entryPrice}, 0)
      RETURNING *
    `);
    const r = rows.rows?.[0] ?? rows[0];
    if (!r) return null;
    return {
      id: r.id,
      venue: r.venue,
      symbol: r.symbol,
      side: r.side,
      size: Number(r.size),
      entryPrice: Number(r.entry_price),
      currentPrice: Number(r.current_price),
      pnlUsd: 0,
      openedAt: new Date(r.opened_at).getTime(),
    };
  } catch (e) {
    console.warn('[clawd-state] openPosition failed:', e);
    return null;
  }
}

export async function closePosition(id: number, exitPrice: number, pnlUsd: number): Promise<void> {
  if (!db) return;
  try {
    await ensureClawdTables();
    await db.execute(sql`
      UPDATE clawd_positions
      SET closed_at = now(), current_price = ${exitPrice}, pnl_usd = ${pnlUsd}
      WHERE id = ${id}
    `);
  } catch (e) {
    console.warn('[clawd-state] closePosition failed:', e);
  }
}

export async function markPositions(prices: Map<string, number>): Promise<void> {
  if (!db) return;
  await ensureClawdTables();
  const open = await getOpenPositions();
  for (const p of open) {
    const cur = prices.get(p.symbol);
    if (!cur || !p.id) continue;
    const pnl = (cur - p.entryPrice) * p.size * (p.side === 'long' ? 1 : -1);
    try {
      await db.execute(sql`UPDATE clawd_positions SET current_price = ${cur}, pnl_usd = ${pnl} WHERE id = ${p.id}`);
    } catch {}
  }
}

export async function recentFills(limit = 50): Promise<Fill[]> {
  if (!db) return [];
  try {
    await ensureClawdTables();
    const rows: any = await db.execute(sql`
      SELECT * FROM clawd_fills ORDER BY ts DESC LIMIT ${limit}
    `);
    const list = rows.rows ?? rows ?? [];
    return list.map((r: any) => ({
      id: r.id,
      ts: new Date(r.ts).getTime(),
      venue: r.venue,
      symbol: r.symbol,
      side: r.side,
      size: Number(r.size),
      price: Number(r.price),
      notionalUsd: Number(r.notional_usd),
      pnlUsd: r.pnl_usd != null ? Number(r.pnl_usd) : undefined,
      mode: r.mode,
      txSignature: r.tx_signature ?? undefined,
      decisionId: r.decision_id ?? undefined,
    }));
  } catch {
    return [];
  }
}

export async function recentDecisions(limit = 50): Promise<any[]> {
  if (!db) return [];
  try {
    await ensureClawdTables();
    const rows: any = await db.execute(sql`
      SELECT * FROM clawd_decisions ORDER BY ts DESC LIMIT ${limit}
    `);
    return (rows.rows ?? rows ?? []).map((r: any) => ({
      id: r.id,
      ts: new Date(r.ts).getTime(),
      venue: r.venue,
      symbol: r.symbol,
      signal: r.signal,
      signalScore: Number(r.signal_score ?? 0),
      signalReasons: r.signal_reasons ?? [],
      gateAction: r.gate_action,
      gateReasoning: r.gate_reasoning,
      outcome: r.outcome,
    }));
  } catch {
    return [];
  }
}
