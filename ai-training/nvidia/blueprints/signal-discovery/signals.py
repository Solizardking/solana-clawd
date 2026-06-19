"""
Blueprint 4 — Quantitative signal detectors for Solana perps.

Each detector takes a market snapshot and returns a SignalResult.
Data is fetched from Phoenix DEX via Vulcan CLI JSON output or direct RPC.
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
    strength: float          # 0–1
    reason: str
    raw: dict


def _vulcan(args: list[str]) -> dict:
    """Run a Vulcan CLI command, return parsed JSON."""
    cmd = ["vulcan"] + args + ["-o", "json"]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        if result.returncode != 0:
            return {"ok": False, "error": result.stderr.strip()}
        return json.loads(result.stdout)
    except FileNotFoundError:
        return {"ok": False, "error": "vulcan not found — install from github.com/Ellipsis-Labs/vulcan-cli"}
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "vulcan command timed out"}
    except json.JSONDecodeError as e:
        return {"ok": False, "error": f"bad JSON: {e}"}


def rsi_signal(market: str, timeframe: str = "1h", period: int = 14) -> SignalResult:
    """RSI oversold (<30) → long, overbought (>70) → short."""
    data = _vulcan(["ta", "compute", market, "--indicator", "rsi",
                    "--timeframe", timeframe, "--period", str(period)])
    rsi = None
    if data.get("ok") and data.get("data"):
        d = data["data"]
        rsi = d.get("value") or (d.get("values", [None])[-1])

    if rsi is None:
        return SignalResult("rsi", market, "neutral", 0.0, "no RSI data", data)

    if rsi < 30:
        return SignalResult("rsi", market, "long", (30 - rsi) / 30, f"RSI={rsi:.1f} oversold", data)
    if rsi > 70:
        return SignalResult("rsi", market, "short", (rsi - 70) / 30, f"RSI={rsi:.1f} overbought", data)
    return SignalResult("rsi", market, "neutral", 0.0, f"RSI={rsi:.1f} neutral", data)


def macd_signal(market: str, timeframe: str = "1h") -> SignalResult:
    """MACD line > signal line → long; MACD < signal → short."""
    data = _vulcan(["ta", "compute", market, "--indicator", "macd",
                    "--timeframe", timeframe,
                    "--params", '{"fast":12,"slow":26,"signal":9}'])
    if not data.get("ok") or not data.get("data"):
        return SignalResult("macd", market, "neutral", 0.0, "no MACD data", data)

    d = data["data"]
    macd_line = d.get("macd") or d.get("value", {}).get("macd")
    signal_line = d.get("signal") or d.get("value", {}).get("signal")

    if macd_line is None or signal_line is None:
        return SignalResult("macd", market, "neutral", 0.0, f"incomplete MACD: {d}", data)

    diff = macd_line - signal_line
    strength = min(abs(diff) / (abs(signal_line) + 1e-9), 1.0)
    if diff > 0:
        return SignalResult("macd", market, "long", strength, f"MACD crossover up ({diff:.4f})", data)
    return SignalResult("macd", market, "short", strength, f"MACD crossover down ({diff:.4f})", data)


def funding_rate_signal(market: str, threshold: float = 0.0005) -> SignalResult:
    """High positive funding → short (longs pay, shorts receive); negative → long."""
    data = _vulcan(["market", "ticker", market])
    funding = None
    if data.get("ok") and data.get("data"):
        funding = data["data"].get("funding_rate") or data["data"].get("fundingRate")

    if funding is None:
        data2 = _vulcan(["market", "funding-rates", market, "--limit", "1"])
        if data2.get("ok") and data2.get("data"):
            rows = data2["data"].get("rows") or data2["data"].get("funding_rates", [])
            if rows:
                funding = rows[0].get("rate") or rows[0].get("funding_rate")

    if funding is None:
        return SignalResult("funding", market, "neutral", 0.0, "no funding data", data)

    strength = min(abs(funding) / threshold, 1.0)
    if funding > threshold:
        return SignalResult("funding", market, "short", strength,
                            f"funding={funding:.6f} > threshold={threshold}", data)
    if funding < -threshold:
        return SignalResult("funding", market, "long", strength,
                            f"funding={funding:.6f} < -{threshold}", data)
    return SignalResult("funding", market, "neutral", 0.0, f"funding={funding:.6f} normal", data)


def orderbook_imbalance_signal(market: str, depth: int = 5, threshold: float = 1.5) -> SignalResult:
    """Bid depth >> ask depth → bullish; ask >> bid → bearish."""
    data = _vulcan(["market", "orderbook", market, "--depth", str(depth)])
    if not data.get("ok") or not data.get("data"):
        return SignalResult("ob_imbalance", market, "neutral", 0.0, "no OB data", data)

    d = data["data"]
    bids = d.get("bids", [])
    asks = d.get("asks", [])

    def total_size(levels: list) -> float:
        s = 0.0
        for lvl in levels:
            if isinstance(lvl, list):
                s += float(lvl[1]) if len(lvl) > 1 else 0
            elif isinstance(lvl, dict):
                s += float(lvl.get("size", lvl.get("quantity", 0)))
        return s

    bid_size = total_size(bids)
    ask_size = total_size(asks)
    ratio = bid_size / (ask_size + 1e-9)

    if ratio > threshold:
        return SignalResult("ob_imbalance", market, "long",
                            min((ratio - threshold) / threshold, 1.0),
                            f"bid/ask={ratio:.2f} bid-heavy", data)
    if ratio < 1 / threshold:
        inv = 1 / (ratio + 1e-9)
        return SignalResult("ob_imbalance", market, "short",
                            min((inv - threshold) / threshold, 1.0),
                            f"bid/ask={ratio:.2f} ask-heavy", data)
    return SignalResult("ob_imbalance", market, "neutral", 0.0, f"bid/ask={ratio:.2f} balanced", data)


def ema_divergence_signal(market: str, period: int = 50, threshold: float = 0.03) -> SignalResult:
    """Price significantly above EMA → potential mean-reversion short."""
    ticker = _vulcan(["market", "ticker", market])
    ema_data = _vulcan(["ta", "compute", market, "--indicator", "ema",
                        "--timeframe", "1h", "--period", str(period)])

    price = None
    if ticker.get("ok") and ticker.get("data"):
        price = ticker["data"].get("mark_price") or ticker["data"].get("price")

    ema = None
    if ema_data.get("ok") and ema_data.get("data"):
        d = ema_data["data"]
        ema = d.get("value") or (d.get("values", [None])[-1])

    if price is None or ema is None:
        return SignalResult("ema_div", market, "neutral", 0.0, "no data", ticker)

    div = (float(price) - float(ema)) / (float(ema) + 1e-9)
    if div > threshold:
        return SignalResult("ema_div", market, "short",
                            min(div / threshold, 1.0),
                            f"price {div*100:.1f}% above EMA{period}", ticker)
    if div < -threshold:
        return SignalResult("ema_div", market, "long",
                            min(abs(div) / threshold, 1.0),
                            f"price {abs(div)*100:.1f}% below EMA{period}", ticker)
    return SignalResult("ema_div", market, "neutral", 0.0, f"price/EMA div={div:.3f}", ticker)


def scan_all(market: str) -> list[SignalResult]:
    return [
        rsi_signal(market),
        macd_signal(market),
        funding_rate_signal(market),
        orderbook_imbalance_signal(market),
        ema_divergence_signal(market),
    ]


if __name__ == "__main__":
    import sys
    mkt = sys.argv[1] if len(sys.argv) > 1 else "SOL"
    print(f"Scanning {mkt} perp signals...\n")
    for s in scan_all(mkt):
        print(f"  [{s.direction:7s}] {s.name:15s} strength={s.strength:.2f}  {s.reason}")
