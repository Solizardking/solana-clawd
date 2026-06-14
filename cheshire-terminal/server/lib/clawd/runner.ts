import { clawdBus } from './bus';
import { gate } from './claude-gate';
import { execute } from './executor';
import { DEFAULT_WATCHLIST, fetchAllSnapshots } from './prices';
import { evaluate } from './strategy';
import {
  getOpenPositions,
  getState,
  markPositions,
  recordDecision,
  updateState,
} from './state';

const TICK_MS = 30_000;

let timer: NodeJS.Timeout | null = null;
let ticking = false;

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const state = await getState();
    if (state.status !== 'running') return;
    const venue = state.mode === 'solana' ? 'solana' : state.mode === 'hyperliquid' ? 'hyperliquid' : 'paper-solana';

    clawdBus.publish({ type: 'tick', payload: { ts: Date.now() } });

    const snaps = await fetchAllSnapshots(DEFAULT_WATCHLIST);
    if (snaps.length === 0) {
      clawdBus.publish({ type: 'log', payload: { level: 'warn', msg: 'No price snapshots — skipping tick.' } });
      return;
    }
    clawdBus.publish({ type: 'snapshot', payload: snaps });

    const priceMap = new Map(snaps.map((s) => [s.symbol, s.price]));
    await markPositions(priceMap);

    const open = await getOpenPositions();

    for (const snap of snaps) {
      const sig = evaluate(snap);
      clawdBus.publish({ type: 'signal', payload: sig });

      if (sig.direction === 'HOLD') continue;

      const decision = await gate(snap, sig, open);
      const decisionId = await recordDecision({
        venue,
        symbol: sig.symbol,
        signal: sig.direction,
        signalScore: sig.score,
        signalReasons: sig.reasons,
        gateAction: decision.action,
        gateReasoning: decision.reasoning,
      });

      clawdBus.publish({
        type: 'gate_decision',
        payload: { symbol: sig.symbol, action: decision.action, reasoning: decision.reasoning, decisionId, signal: sig },
      });

      if (decision.action === 'APPROVE') {
        await execute(sig, snap, decisionId);
      }
    }

    await updateState({ lastTick: Date.now() });
    clawdBus.publish({ type: 'state', payload: await getState() });
  } catch (e: any) {
    clawdBus.publish({ type: 'error', payload: { msg: e?.message ?? 'tick error' } });
    console.error('[clawd-runner] tick error:', e);
  } finally {
    ticking = false;
  }
}

export async function start() {
  if (timer) return;
  await updateState({ status: 'running' });
  clawdBus.publish({ type: 'log', payload: { level: 'info', msg: '🦞 Clawd online. Vault sealed. Laws loaded. Ready to trade.' } });
  clawdBus.publish({ type: 'state', payload: await getState() });
  timer = setInterval(tick, TICK_MS);
  tick().catch(() => {});
}

export async function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  await updateState({ status: 'paused' });
  clawdBus.publish({ type: 'log', payload: { level: 'info', msg: 'Clawd paused.' } });
  clawdBus.publish({ type: 'state', payload: await getState() });
}

export async function forceTick() {
  await tick();
}

export async function autostartIfConfigured() {
  if (process.env.CLAWD_AUTOSTART === 'true') {
    await start();
  }
}
