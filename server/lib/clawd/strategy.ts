import type { PriceSnapshot, StrategySignal } from './types';

function rsi(values: number[], period = 14): number {
  if (values.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = values.length - period; i < values.length; i++) {
    const delta = values[i] - values[i - 1];
    if (delta > 0) gains += delta;
    else losses -= delta;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function momentum(values: number[], lookback = 10): number {
  if (values.length < lookback + 1) return 0;
  const a = values[values.length - lookback - 1];
  const b = values[values.length - 1];
  return a > 0 ? (b - a) / a : 0;
}

const DEFAULT_NOTIONAL_USD = 50;

export function evaluate(snap: PriceSnapshot): StrategySignal {
  const reasons: string[] = [];
  const r = rsi(snap.history);
  const m = momentum(snap.history, 10);

  let score = 0;

  if (r < 30) {
    score += 1;
    reasons.push(`RSI ${r.toFixed(1)} oversold`);
  } else if (r > 70) {
    score -= 1;
    reasons.push(`RSI ${r.toFixed(1)} overbought`);
  } else {
    reasons.push(`RSI ${r.toFixed(1)} neutral`);
  }

  if (m > 0.02) {
    score += 1;
    reasons.push(`+${(m * 100).toFixed(2)}% momentum`);
  } else if (m < -0.02) {
    score -= 1;
    reasons.push(`${(m * 100).toFixed(2)}% momentum`);
  }

  if (snap.priceChange24h < -8 && r < 40) {
    score += 1;
    reasons.push(`24h dump ${snap.priceChange24h.toFixed(1)}% — eat the dip`);
  }

  if (snap.priceChange24h > 30 && r > 65) {
    score -= 1;
    reasons.push(`24h pump ${snap.priceChange24h.toFixed(1)}% — fade the top`);
  }

  const direction = score >= 2 ? 'BUY' : score <= -2 ? 'SELL' : 'HOLD';

  return {
    symbol: snap.symbol,
    mint: snap.mint,
    direction,
    score,
    reasons,
    suggestedNotionalUsd: DEFAULT_NOTIONAL_USD,
    ts: snap.ts,
  };
}
