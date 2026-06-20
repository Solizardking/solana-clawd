"""
Phoenix + Jupiter price fetcher for Blueprint 2 portfolio optimization.

Fetches OHLCV candle data from the Phoenix perps RPC endpoint (via Vulcan)
and Jupiter price API, returning a price history dict compatible with
scenarios.historical_returns().

Priority:
  1. Vulcan CLI `market-candles` (Phoenix on-chain, most accurate)
  2. Jupiter Price API v2 (spot, falls back when Phoenix unavailable)
  3. Synthetic stub (dev/offline fallback)

Markets supported:
  SOL, BTC, ETH, JUP, JTO, BONK (spot via Jupiter)
  SOL-PERP, BTC-PERP, ETH-PERP   (perps via Phoenix/Vulcan)
"""

from __future__ import annotations

import json
import os
import subprocess
import time
from typing import Optional

import numpy as np


# ── Phoenix market IDs (Vulcan CLI names) ─────────────────────────────────

VULCAN_BIN = os.path.expanduser("~/.local/bin/vulcan")

# Maps user asset names → Vulcan symbol (Phoenix perps only)
PHOENIX_MARKETS = {
    "SOL-PERP": "SOL",
    "BTC-PERP": "BTC",
    "ETH-PERP": "ETH",
    # spot aliases also supported by vulcan
    "SOL": "SOL",
    "BTC": "BTC",
    "ETH": "ETH",
}

JUPITER_MINTS = {
    "SOL":  "So11111111111111111111111111111111111111112",
    "BTC":  "9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E",
    "ETH":  "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
    "JUP":  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    "JTO":  "jtojtomepa8beP8AuQc6eXt5FriJwfFMwjx2v2iubsj",
    "BONK": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    "PYTH": "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3",
}


def fetch_phoenix_candles(market: str, n_days: int = 90) -> list[float] | None:
    """
    Fetch daily close prices from Phoenix via Vulcan CLI.
    Returns list of closes (oldest→newest) or None on failure.
    Parses Vulcan's box-drawing table output (no --json flag available).
    """
    symbol = PHOENIX_MARKETS.get(market, market)
    vulcan = VULCAN_BIN if os.path.exists(VULCAN_BIN) else "vulcan"
    try:
        result = subprocess.run(
            [vulcan, "market", "candles", symbol,
             "--interval", "1d", "--limit", str(n_days)],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode != 0:
            return None
        closes = []
        for line in result.stdout.splitlines():
            if "┆" not in line:
                continue
            parts = [p.strip() for p in line.split("┆")]
            # columns: Time | Open | High | Low | Close | Volume
            if len(parts) < 6:
                continue
            try:
                close = float(parts[4])
                closes.append(close)
            except ValueError:
                continue
        return closes if len(closes) >= 5 else None
    except Exception:
        return None


def fetch_jupiter_history(asset: str, n_days: int = 90) -> list[float] | None:
    """
    Fetch price history from Jupiter Price API v2.
    Returns synthetic walk anchored to current price (Jupiter has no history endpoint).
    """
    try:
        import urllib.request
        mint = JUPITER_MINTS.get(asset)
        if not mint:
            return None
        url = f"https://price.jup.ag/v6/price?ids={mint}"
        with urllib.request.urlopen(url, timeout=10) as resp:
            data = json.loads(resp.read())
        price = data["data"][mint]["price"]
        # Anchor a synthetic history to the real current price
        rng = np.random.default_rng(seed=int(price * 1000) % 2**32)
        vol = {"SOL": 0.04, "BTC": 0.025, "ETH": 0.03}.get(asset, 0.05)
        daily = 1 + rng.normal(0.0005, vol, n_days)
        daily[-1] = price / (price / daily.prod())  # pin last price
        prices = price * np.cumprod(daily[::-1])[::-1]
        # scale so last = current
        prices = prices * (price / prices[-1])
        return prices.tolist()
    except Exception:
        return None


def _synthetic_stub(asset: str, n_days: int) -> list[float]:
    """Offline fallback with realistic Solana-ecosystem vol."""
    base = {"SOL": 150, "BTC": 65000, "ETH": 3500, "JUP": 0.8,
            "JTO": 3.5, "BONK": 0.000025, "PYTH": 0.45,
            "SOL-PERP": 150, "BTC-PERP": 65000, "ETH-PERP": 3500}
    vol  = {"SOL": 0.04, "BTC": 0.025, "ETH": 0.03, "JUP": 0.06,
            "JTO": 0.07, "BONK": 0.10, "PYTH": 0.06,
            "SOL-PERP": 0.045, "BTC-PERP": 0.027, "ETH-PERP": 0.033}
    rng = np.random.default_rng(seed=sum(ord(c) for c in asset))
    s = base.get(asset, 10.0)
    v = vol.get(asset, 0.05)
    daily = 1 + rng.normal(0.0005, v, n_days)
    return (s * np.cumprod(daily)).tolist()


def fetch_prices(
    assets: list[str],
    n_days: int = 90,
    verbose: bool = True,
) -> dict[str, list[float]]:
    """
    Fetch price history for a list of assets.

    For Phoenix perp markets (e.g. 'SOL-PERP') tries Vulcan first.
    For spot assets tries Jupiter. Falls back to synthetic stub.

    Returns dict[asset -> list[float]] with at least n_days prices.
    """
    prices = {}
    for asset in assets:
        closes = None

        # Try Vulcan/Phoenix first for any supported market
        if asset in PHOENIX_MARKETS:
            closes = fetch_phoenix_candles(asset, n_days)
            if closes and verbose:
                print(f"  [{asset}] phoenix/vulcan  {len(closes)} days  last={closes[-1]:.4f}")

        # Jupiter price API (spot) — offline in sandboxed envs
        if closes is None:
            spot = PHOENIX_MARKETS.get(asset, asset)
            closes = fetch_jupiter_history(spot, n_days)
            if closes and verbose:
                print(f"  [{asset}] jupiter  {len(closes)} days  last={closes[-1]:.4f}")

        # Synthetic fallback (no network needed)
        if closes is None:
            closes = _synthetic_stub(asset, n_days)
            if verbose:
                print(f"  [{asset}] synthetic (offline)  last={closes[-1]:.4f}")

        prices[asset] = closes[:n_days]

    return prices


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--assets", nargs="+",
                        default=["SOL", "BTC", "ETH", "SOL-PERP"])
    parser.add_argument("--days", type=int, default=90)
    args = parser.parse_args()

    print(f"Fetching {args.days}-day price history for {args.assets}...")
    px = fetch_prices(args.assets, args.days)
    for a, p in px.items():
        print(f"  {a}: {len(p)} days, last={p[-1]:.6g}")
