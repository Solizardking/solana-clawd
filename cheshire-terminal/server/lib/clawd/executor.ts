import { clawdBus } from './bus';
import { executeLive } from './solana-trader';
import {
  closePosition,
  getOpenPositions,
  getState,
  openPosition,
  recordFill,
  updateState,
} from './state';
import type { Fill, PriceSnapshot, StrategySignal, Venue } from './types';

const PAPER_VENUE: Venue = 'paper-solana';

const RISK = {
  maxPositionsPerSymbol: 2,
  maxOpenPositions: 8,
  maxNotionalPerTrade: 500,
  minCash: 100,
  slippageBps: 30,
};

export async function execute(
  sig: StrategySignal,
  snap: PriceSnapshot,
  decisionId: number | null,
): Promise<Fill | null> {
  const state = await getState();
  if (state.mode === 'solana') {
    return executeLive(sig, snap, decisionId);
  }
  if (state.mode === 'hyperliquid') {
    clawdBus.publish({
      type: 'log',
      payload: { level: 'warn', msg: 'Hyperliquid executor not yet wired (Phase 3) — skipping.' },
    });
    return null;
  }

  const open = await getOpenPositions();
  if (open.length >= RISK.maxOpenPositions) {
    clawdBus.publish({ type: 'log', payload: { level: 'warn', msg: 'Max open positions reached — skipping.' } });
    return null;
  }
  const inSymbol = open.filter((p) => p.symbol === sig.symbol);

  const slippage = 1 + (sig.direction === 'BUY' ? RISK.slippageBps / 10000 : -RISK.slippageBps / 10000);
  const fillPrice = snap.price * slippage;
  const notional = Math.min(sig.suggestedNotionalUsd, RISK.maxNotionalPerTrade);
  const size = notional / fillPrice;

  if (sig.direction === 'BUY') {
    if (inSymbol.filter((p) => p.side === 'long').length >= RISK.maxPositionsPerSymbol) {
      clawdBus.publish({
        type: 'log',
        payload: { level: 'info', msg: `Long cap reached for ${sig.symbol}` },
      });
      return null;
    }
    if (state.cashUsd - notional < RISK.minCash) {
      clawdBus.publish({ type: 'log', payload: { level: 'warn', msg: 'Cash floor reached.' } });
      return null;
    }

    const pos = await openPosition({
      venue: PAPER_VENUE,
      symbol: sig.symbol,
      side: 'long',
      size,
      entryPrice: fillPrice,
    });

    const fill: Fill = {
      ts: Date.now(),
      venue: PAPER_VENUE,
      symbol: sig.symbol,
      side: 'buy',
      size,
      price: fillPrice,
      notionalUsd: notional,
      mode: 'paper',
      decisionId: decisionId ?? undefined,
    };
    fill.id = (await recordFill(fill)) ?? undefined;

    await updateState({ cashUsd: state.cashUsd - notional, totalFills: state.totalFills + 1, lastTick: Date.now() });
    clawdBus.publish({ type: 'fill', payload: fill });
    if (pos) clawdBus.publish({ type: 'position_update', payload: { action: 'open', position: pos } });
    return fill;
  }

  if (sig.direction === 'SELL') {
    const longs = inSymbol.filter((p) => p.side === 'long');
    if (longs.length === 0) {
      clawdBus.publish({
        type: 'log',
        payload: { level: 'info', msg: `No long position to close on ${sig.symbol}.` },
      });
      return null;
    }
    const oldest = longs[longs.length - 1];
    if (!oldest.id) return null;
    const proceeds = oldest.size * fillPrice;
    const cost = oldest.size * oldest.entryPrice;
    const pnl = proceeds - cost;

    await closePosition(oldest.id, fillPrice, pnl);

    const fill: Fill = {
      ts: Date.now(),
      venue: PAPER_VENUE,
      symbol: sig.symbol,
      side: 'sell',
      size: oldest.size,
      price: fillPrice,
      notionalUsd: proceeds,
      pnlUsd: pnl,
      mode: 'paper',
      decisionId: decisionId ?? undefined,
    };
    fill.id = (await recordFill(fill)) ?? undefined;

    await updateState({
      cashUsd: state.cashUsd + proceeds,
      totalPnlUsd: state.totalPnlUsd + pnl,
      totalFills: state.totalFills + 1,
      lastTick: Date.now(),
    });
    clawdBus.publish({ type: 'fill', payload: fill });
    clawdBus.publish({ type: 'position_update', payload: { action: 'close', positionId: oldest.id, pnl } });
    return fill;
  }

  return null;
}
