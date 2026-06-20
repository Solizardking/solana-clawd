"""
Blueprint 4 — Quantitative signal detectors for Solana perps (improved).

Uses `vulcan ta report` as a single batch call to fetch RSI, MACD, BBands,
ATR, and ADX in one round-trip, then applies per-indicator logic.

Additional signals use `vulcan market ticker` (funding, price) and
`vulcan market orderbook` (bid/ask imbalance).

Signal count: 7
  rsi          — oversold / overbought extremes
  macd         — histogram momentum direction + crossover
  bbands       — price near upper/lower band (mean-reversion signal)
  atr_vol      — ATR as % of price (volatility filter)
  adx_trend    — ADX trend strength (entry filter)
  funding      — sentiment proxy: crowded longs pay shorts
  ob_imbalance — live bid/ask size pressure
"""
from __future__ import annotations

import json
import os
import subprocess
from dataclasses import dataclass
from typing import Literal


SignalDirection = Literal["long", "short", "neutral"]


@dataclass
class SignalResult:
    name: str
    market: str
    direction: SignalDirection
    strength: float     # 0–1
    reason: str
    raw: dict


# ── Vulcan subprocess wrapper ─────────────────────────────────────────────────

def _vulcan(args: list[str]) -> dict:
    cmd = ["vulcan"] + args + ["-o", "json"]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
        if r.returncode != 0:
            return {"ok": False, "error": r.stderr.strip()}
        parsed = json.loads(r.stdout)
        # Normalise: Vulcan wraps in {ok, data} but sometimes returns bare object
        if "ok" in parsed:
            return parsed
        return {"ok": True, "data": parsed}
    except FileNotFoundError:
        return {"ok": False, "error": "vulcan not on PATH"}
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "vulcan timeout"}
    except json.JSONDecodeError as e:
        return {"ok": False, "error": f"bad JSON: {e}"}


def _d(resp: dict) -> dict:
    """Extract the inner data dict."""
    return resp.get("data", {}) if resp.get("ok") else {}


# ── Batch fetch: vulcan ta report ─────────────────────────────────────────────

def _ta_report(market: str, timeframe: str = "1h") -> dict[str, dict]:
    """
    Returns {kind: {latest, signals, summary}} for all indicators in one call.
    Uses `vulcan ta report <symbol> --timeframe <tf>`.
    """
    resp = _vulcan(["ta", "report", market, "--timeframe", timeframe])
    result: dict[str, dict] = {}
    indicators = _d(resp).get("indicators", [])
    for ind in indicators:
        kind = ind.get("kind", "")
        if kind:
            result[kind] = {
                "latest": ind.get("latest", {}),
                "signals": ind.get("signals", {}),
                "summary": ind.get("summary", {}),
            }
    return result


# ── Signal 1: RSI ─────────────────────────────────────────────────────────────

def rsi_signal(market: str, report: dict | None = None,
               timeframe: str = "1h") -> SignalResult:
    """RSI < 30 → oversold (long); RSI > 70 → overbought (short)."""
    if report is None:
        r = _vulcan(["ta", "compute", market, "--indicator", "rsi",
                     "--timeframe", timeframe])
        ind = {"latest": _d(r).get("latest", {}), "signals": _d(r).get("signals", {})}
    else:
        ind = report.get("rsi", {})

    rsi = ind.get("latest", {}).get("rsi")
    state = ind.get("signals", {}).get("state", "")

    if rsi is None:
        return SignalResult("rsi", market, "neutral", 0.0, "no RSI data", ind)

    if rsi < 30:
        strength = min((30 - rsi) / 30, 1.0)
        return SignalResult("rsi", market, "long", strength, f"RSI={rsi:.1f} oversold", ind)
    if rsi > 70:
        strength = min((rsi - 70) / 30, 1.0)
        return SignalResult("rsi", market, "short", strength, f"RSI={rsi:.1f} overbought", ind)

    # Mild signals: 40–50 range approaching oversold, 50–60 approaching overbought
    if rsi < 40:
        return SignalResult("rsi", market, "long", (40 - rsi) / 40 * 0.3,
                            f"RSI={rsi:.1f} approaching oversold", ind)
    if rsi > 60:
        return SignalResult("rsi", market, "short", (rsi - 60) / 40 * 0.3,
                            f"RSI={rsi:.1f} approaching overbought", ind)

    return SignalResult("rsi", market, "neutral", 0.0, f"RSI={rsi:.1f} ({state})", ind)


# ── Signal 2: MACD ────────────────────────────────────────────────────────────

def macd_signal(market: str, report: dict | None = None,
                timeframe: str = "1h") -> SignalResult:
    """
    MACD histogram positive → bullish momentum (long).
    MACD histogram negative → bearish momentum (short).
    Strength = |hist| / mean_abs_hist (capped at 1).
    """
    if report is None:
        r = _vulcan(["ta", "compute", market, "--indicator", "macd",
                     "--timeframe", timeframe])
        ind = {"latest": _d(r).get("latest", {}),
               "signals": _d(r).get("signals", {}),
               "summary": _d(r).get("summary", {})}
    else:
        ind = report.get("macd", {})

    latest = ind.get("latest", {})
    hist   = latest.get("hist")
    macd   = latest.get("macd")
    sig    = latest.get("signal")
    mom    = ind.get("signals", {}).get("momentum", "")
    mean_abs = abs(ind.get("summary", {}).get("mean", 0.1)) or 0.1

    if hist is None:
        return SignalResult("macd", market, "neutral", 0.0, "no MACD data", ind)

    strength = min(abs(hist) / (mean_abs + 1e-9), 1.0)

    if hist > 0:
        return SignalResult("macd", market, "long", strength,
                            f"MACD hist={hist:.4f} bullish ({mom})", ind)
    return SignalResult("macd", market, "short", strength,
                        f"MACD hist={hist:.4f} bearish ({mom})", ind)


# ── Signal 3: Bollinger Bands ─────────────────────────────────────────────────

def bbands_signal(market: str, report: dict | None = None,
                  timeframe: str = "1h",
                  upper_thresh: float = 0.85,
                  lower_thresh: float = 0.15) -> SignalResult:
    """
    Price near upper band (position_in_band > 0.85) → mean-reversion short.
    Price near lower band (< 0.15) → mean-reversion long.
    """
    if report is None:
        r = _vulcan(["ta", "compute", market, "--indicator", "bbands",
                     "--timeframe", timeframe])
        ind = {"latest": _d(r).get("latest", {}), "signals": _d(r).get("signals", {})}
    else:
        ind = report.get("bbands", {})

    sigs = ind.get("signals", {})
    pos  = sigs.get("position_in_band")   # 0=at lower, 1=at upper
    state = sigs.get("state", "")
    width_pct = sigs.get("width_pct", 0)

    if pos is None:
        return SignalResult("bbands", market, "neutral", 0.0, "no BBands data", ind)

    # Narrow band = low volatility squeeze (not a directional signal yet)
    if width_pct < 1.0:
        return SignalResult("bbands", market, "neutral", 0.0,
                            f"BB squeeze width={width_pct:.2f}%", ind)

    if pos > upper_thresh:
        strength = min((pos - upper_thresh) / (1 - upper_thresh), 1.0)
        return SignalResult("bbands", market, "short", strength,
                            f"BB near upper band pos={pos:.2f} ({state})", ind)
    if pos < lower_thresh:
        strength = min((lower_thresh - pos) / lower_thresh, 1.0)
        return SignalResult("bbands", market, "long", strength,
                            f"BB near lower band pos={pos:.2f} ({state})", ind)

    return SignalResult("bbands", market, "neutral", 0.0,
                        f"BB mid pos={pos:.2f} width={width_pct:.2f}%", ind)


# ── Signal 4: ATR Volatility filter ──────────────────────────────────────────

def atr_signal(market: str, report: dict | None = None,
               timeframe: str = "1h",
               low_vol_thresh: float = 0.5,
               high_vol_thresh: float = 2.0) -> SignalResult:
    """
    ATR as % of price:
      < 0.5% → low vol, markets tend to mean-revert → slightly long bias
      > 2.0% → high vol, trend continuation likely → amplify directional signals
    This is primarily a filter/modifier, not a directional signal on its own.
    """
    if report is None:
        r = _vulcan(["ta", "compute", market, "--indicator", "atr",
                     "--timeframe", timeframe])
        ind = {"latest": _d(r).get("latest", {}), "signals": _d(r).get("signals", {})}
    else:
        ind = report.get("atr", {})

    atr_pct = ind.get("signals", {}).get("atr_pct_of_price")
    atr_val = ind.get("latest", {}).get("atr")

    if atr_pct is None:
        return SignalResult("atr_vol", market, "neutral", 0.0, "no ATR data", ind)

    if atr_pct < low_vol_thresh:
        return SignalResult("atr_vol", market, "long", 0.2,
                            f"ATR={atr_val:.4f} ({atr_pct:.2f}%) low vol → mean-revert bias", ind)
    if atr_pct > high_vol_thresh:
        return SignalResult("atr_vol", market, "neutral", 0.0,
                            f"ATR={atr_val:.4f} ({atr_pct:.2f}%) high vol — trend mode", ind)

    return SignalResult("atr_vol", market, "neutral", 0.0,
                        f"ATR={atr_val:.4f} ({atr_pct:.2f}%) normal", ind)


# ── Signal 5: ADX Trend strength ─────────────────────────────────────────────

def adx_signal(market: str, report: dict | None = None,
               timeframe: str = "1h") -> SignalResult:
    """
    ADX measures trend strength (not direction):
      > 25 strong trend → trust directional signals more
      < 20 weak/ranging → prefer mean-reversion signals
    Returns long/short based on ADX strength as a filter signal.
    """
    if report is None:
        r = _vulcan(["ta", "compute", market, "--indicator", "adx",
                     "--timeframe", timeframe])
        ind = {"latest": _d(r).get("latest", {}), "signals": _d(r).get("signals", {})}
    else:
        ind = report.get("adx", {})

    adx_val  = ind.get("latest", {}).get("adx")
    strength_label = ind.get("signals", {}).get("trend_strength", "")

    if adx_val is None:
        return SignalResult("adx_trend", market, "neutral", 0.0, "no ADX data", ind)

    # Strong trend: confirms directional signals (neutral direction but high weight)
    if adx_val > 25:
        return SignalResult("adx_trend", market, "neutral",
                            min((adx_val - 25) / 50, 1.0),
                            f"ADX={adx_val:.1f} {strength_label} — trend confirmed", ind)
    # Weak trend: market is ranging, mean-reversion more reliable
    return SignalResult("adx_trend", market, "neutral", 0.0,
                        f"ADX={adx_val:.1f} {strength_label} — ranging", ind)


# ── Signal 6: Funding rate ────────────────────────────────────────────────────

def funding_rate_signal(market: str, threshold: float = 0.0003) -> SignalResult:
    """Extreme positive funding → short (longs overcrowded); extreme negative → long."""
    r = _vulcan(["market", "ticker", market])
    d = _d(r)
    funding = d.get("funding_rate") or d.get("fundingRate")

    if funding is None:
        r2 = _vulcan(["market", "funding-rates", market, "--limit", "1"])
        rows = _d(r2).get("rows") or _d(r2).get("funding_rates", [])
        if rows:
            funding = rows[0].get("rate") or rows[0].get("funding_rate")

    if funding is None:
        return SignalResult("funding", market, "neutral", 0.0, "no funding data", d)

    strength = min(abs(float(funding)) / threshold, 1.0)
    if float(funding) > threshold:
        return SignalResult("funding", market, "short", strength,
                            f"funding={float(funding):.6f} longs crowded", d)
    if float(funding) < -threshold:
        return SignalResult("funding", market, "long", strength,
                            f"funding={float(funding):.6f} shorts crowded", d)
    return SignalResult("funding", market, "neutral", 0.0,
                        f"funding={float(funding):.6f} neutral", d)


# ── Signal 7: Orderbook imbalance ────────────────────────────────────────────

def orderbook_imbalance_signal(market: str, depth: int = 10,
                                threshold: float = 1.5) -> SignalResult:
    """Bid depth >> ask depth → bullish pressure; reverse → bearish."""
    r = _vulcan(["market", "orderbook", market, "--depth", str(depth)])
    d = _d(r)
    bids = d.get("bids", [])
    asks = d.get("asks", [])

    def total(levels: list) -> float:
        s = 0.0
        for lvl in levels:
            if isinstance(lvl, list) and len(lvl) > 1:
                s += float(lvl[1])
            elif isinstance(lvl, dict):
                s += float(lvl.get("size", lvl.get("quantity", 0)))
        return s

    bid_sz = total(bids)
    ask_sz = total(asks)
    ratio = bid_sz / (ask_sz + 1e-9)

    if ratio > threshold:
        return SignalResult("ob_imbalance", market, "long",
                            min((ratio - threshold) / threshold, 1.0),
                            f"bid/ask={ratio:.2f} bid-heavy", d)
    if ratio < 1 / threshold:
        inv = 1 / (ratio + 1e-9)
        return SignalResult("ob_imbalance", market, "short",
                            min((inv - threshold) / threshold, 1.0),
                            f"bid/ask={ratio:.2f} ask-heavy", d)
    return SignalResult("ob_imbalance", market, "neutral", 0.0,
                        f"bid/ask={ratio:.2f} balanced", d)


# ── Composite scan ────────────────────────────────────────────────────────────

def scan_all(market: str, timeframe: str = "1h") -> list[SignalResult]:
    """
    Run all 7 signal detectors. Uses one `vulcan ta report` call for
    RSI/MACD/BBands/ATR/ADX, then two separate calls for funding and OB.
    """
    report = _ta_report(market, timeframe)
    return [
        rsi_signal(market, report, timeframe),
        macd_signal(market, report, timeframe),
        bbands_signal(market, report, timeframe),
        atr_signal(market, report, timeframe),
        adx_signal(market, report, timeframe),
        funding_rate_signal(market),
        orderbook_imbalance_signal(market),
    ]


def score_signals(results: list[SignalResult]) -> tuple[str, float]:
    """
    Weighted composite score.

    ADX trend strength amplifies directional signals when trend is strong.
    Requires ≥2 directional signals to agree before issuing a composite direction.
    """
    adx_result = next((s for s in results if s.name == "adx_trend"), None)
    trend_multiplier = 1.0 + (adx_result.strength * 0.5 if adx_result else 0.0)

    # Weights by signal reliability
    WEIGHTS = {
        "rsi": 1.2,
        "macd": 1.2,
        "bbands": 0.8,
        "atr_vol": 0.3,
        "adx_trend": 0.0,   # filter only, not directional
        "funding": 1.5,     # highest: directly measures sentiment
        "ob_imbalance": 1.0,
    }

    long_w = sum(WEIGHTS.get(s.name, 1.0) * s.strength * trend_multiplier
                 for s in results if s.direction == "long")
    short_w = sum(WEIGHTS.get(s.name, 1.0) * s.strength * trend_multiplier
                  for s in results if s.direction == "short")

    long_count  = sum(1 for s in results if s.direction == "long" and s.name != "adx_trend")
    short_count = sum(1 for s in results if s.direction == "short" and s.name != "adx_trend")

    total_w = sum(WEIGHTS.get(s.name, 1.0) for s in results if s.name != "adx_trend")

    if long_count >= 2 and long_w > short_w:
        return "long", min(long_w / (total_w + 1e-9), 1.0)
    if short_count >= 2 and short_w > long_w:
        return "short", min(short_w / (total_w + 1e-9), 1.0)
    return "neutral", 0.0


def get_adx_multiplier(results: list[SignalResult]) -> float:
    """Return ADX trend multiplier for strategy sizing."""
    adx = next((s for s in results if s.name == "adx_trend"), None)
    return 1.0 + (adx.strength * 0.5 if adx else 0.0)


if __name__ == "__main__":
    import sys
    mkt = sys.argv[1] if len(sys.argv) > 1 else "SOL"
    tf  = sys.argv[2] if len(sys.argv) > 2 else "1h"
    print(f"Scanning {mkt} {tf} signals...\n")
    results = scan_all(mkt, tf)
    for s in results:
        bar = "█" * int(s.strength * 10)
        print(f"  [{s.direction:7s}] {s.name:15s} {bar:<10s} {s.strength:.3f}  {s.reason}")
    direction, strength = score_signals(results)
    print(f"\n  composite: {direction}  strength={strength:.3f}")
