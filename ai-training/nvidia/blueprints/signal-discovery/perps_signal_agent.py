"""
Phoenix Perps Signal Agent — Blueprint 4 (NVIDIA Quantitative Signal Discovery).

Uses:
  - RPC_URL (Solana mainnet/devnet) for on-chain account reads
  - Vulcan CLI JSON API for Phoenix market data + technical indicators
  - Phoenix REST API (docs.phoenix.trade) for funding rates and OI
  - NVIDIA NIM (optional) for LLM-graded signal quality

On each tick:
  1. Read Phoenix market state from RPC_URL
  2. Compute technical signals via Vulcan ta + market commands
  3. Grade composite signal strength
  4. Emit Vulcan paper trade command if signal is above threshold
  5. Log signal to data/nvidia_signal_log.jsonl for SFT dataset

Run:
  export RPC_URL=https://api.mainnet-beta.solana.com
  export NVIDIA_API_KEY=nvapi-...          # optional: LLM signal grader
  python3 perps_signal_agent.py --market SOL --mode paper --loop
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path

from signals import (
    scan_all,
    SignalResult,
    rsi_signal,
    macd_signal,
    funding_rate_signal,
    orderbook_imbalance_signal,
    ema_divergence_signal,
)


# ── RPC helpers ──────────────────────────────────────────────────────────────

PHOENIX_PERP_PROGRAM = "PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY"


def _rpc_call(method: str, params: list, rpc_url: str) -> dict:
    try:
        import httpx
        r = httpx.post(
            rpc_url,
            json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
            timeout=15,
        )
        r.raise_for_status()
        return r.json()
    except ImportError:
        import urllib.request, json as _json
        req = urllib.request.Request(
            rpc_url,
            data=_json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode(),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            return _json.loads(resp.read())


def get_sol_price_rpc(rpc_url: str) -> float | None:
    """Read SOL price from Pyth oracle via RPC (mainnet Pyth SOL/USD feed)."""
    PYTH_SOL_USD = "H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG"
    try:
        resp = _rpc_call(
            "getAccountInfo",
            [PYTH_SOL_USD, {"encoding": "base64"}],
            rpc_url,
        )
        # Pyth account parsing is complex — return None if we can't decode
        # A production implementation uses pyth-client or switchboard SDK
        return None
    except Exception:
        return None


# ── Vulcan helpers ────────────────────────────────────────────────────────────

def _vulcan_json(args: list[str]) -> dict:
    cmd = ["vulcan"] + args + ["-o", "json"]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
        if r.returncode != 0:
            return {"ok": False, "error": r.stderr.strip()}
        return json.loads(r.stdout)
    except FileNotFoundError:
        return {"ok": False, "error": "vulcan not installed"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def get_mark_price(market: str) -> float | None:
    data = _vulcan_json(["market", "ticker", market])
    if data.get("ok") and data.get("data"):
        d = data["data"]
        return float(d.get("mark_price") or d.get("price") or 0) or None
    return None


def get_funding_rate(market: str) -> float | None:
    data = _vulcan_json(["market", "ticker", market])
    if data.get("ok") and data.get("data"):
        return data["data"].get("funding_rate") or data["data"].get("fundingRate")
    return None


def get_open_interest(market: str) -> float | None:
    data = _vulcan_json(["market", "ticker", market])
    if data.get("ok") and data.get("data"):
        return data["data"].get("open_interest") or data["data"].get("openInterest")
    return None


# ── Signal scoring ────────────────────────────────────────────────────────────

@dataclass
class CompositeSignal:
    market: str
    timestamp: str
    direction: str           # "long" | "short" | "neutral"
    composite_strength: float
    signals: list[dict]
    mark_price: float | None
    funding_rate: float | None
    open_interest: float | None
    recommended_action: str


def score_signals(signals: list[SignalResult]) -> tuple[str, float]:
    """Aggregate individual signals into composite direction + strength."""
    long_score = sum(s.strength for s in signals if s.direction == "long")
    short_score = sum(s.strength for s in signals if s.direction == "short")
    total = long_score + short_score
    if total < 0.01:
        return "neutral", 0.0
    if long_score > short_score:
        return "long", long_score / max(len(signals), 1)
    return "short", short_score / max(len(signals), 1)


def build_composite(market: str, rpc_url: str) -> CompositeSignal:
    signals = scan_all(market)
    direction, strength = score_signals(signals)

    mark_price = get_mark_price(market)
    funding = get_funding_rate(market)
    oi = get_open_interest(market)

    # Recommended action
    if direction == "neutral" or strength < 0.2:
        action = f"# hold — composite strength {strength:.2f} below threshold"
    elif direction == "long":
        action = f"vulcan paper buy {market} --notional-usdc 100 --type market"
    else:
        action = f"vulcan paper sell {market} --notional-usdc 100 --type market"

    return CompositeSignal(
        market=market,
        timestamp=datetime.now(timezone.utc).isoformat(),
        direction=direction,
        composite_strength=round(strength, 4),
        signals=[
            {
                "name": s.name,
                "direction": s.direction,
                "strength": round(s.strength, 4),
                "reason": s.reason,
            }
            for s in signals
        ],
        mark_price=mark_price,
        funding_rate=funding,
        open_interest=oi,
        recommended_action=action,
    )


# ── SFT data logger ──────────────────────────────────────────────────────────

def log_as_sft(composite: CompositeSignal, log_path: Path) -> None:
    """Append signal as ChatML SFT example for training data."""
    signal_summary = "\n".join(
        f"  {s['name']:15s} [{s['direction']:7s}] strength={s['strength']:.2f}  {s['reason']}"
        for s in composite.signals
    )
    user_msg = (
        f"Analyze {composite.market}-PERP signals at {composite.timestamp}.\n"
        f"Mark price: {composite.mark_price}\n"
        f"Funding rate: {composite.funding_rate}\n"
        f"Open interest: {composite.open_interest}\n\n"
        f"Raw signals:\n{signal_summary}"
    )
    assistant_msg = (
        f"Composite signal: {composite.direction.upper()} "
        f"(strength={composite.composite_strength:.2f})\n\n"
        f"Action: `{composite.recommended_action}`\n\n"
        f"Rationale: {composite.composite_strength:.0%} of indicators align "
        f"{composite.direction}. "
        f"{'Strong conviction — execute paper trade.' if composite.composite_strength > 0.5 else 'Weak signal — hold and monitor.'}"
    )
    record = {
        "messages": [
            {"role": "system", "content": "You are Clawd, a sovereign Solana-native AI agent specialized in Phoenix perpetuals trading."},
            {"role": "user", "content": user_msg},
            {"role": "assistant", "content": assistant_msg},
        ]
    }
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a") as f:
        f.write(json.dumps(record) + "\n")


# ── Main loop ─────────────────────────────────────────────────────────────────

def run_tick(market: str, mode: str, rpc_url: str, threshold: float, log_path: Path) -> CompositeSignal:
    composite = build_composite(market, rpc_url)

    print(f"\n[{composite.timestamp}] {market}-PERP")
    print(f"  price={composite.mark_price}  funding={composite.funding_rate}  OI={composite.open_interest}")
    for s in composite.signals:
        print(f"  [{s['direction']:7s}] {s['name']:15s} {s['strength']:.2f}  {s['reason']}")
    print(f"  COMPOSITE: {composite.direction.upper()}  strength={composite.composite_strength:.3f}")
    print(f"  ACTION: {composite.recommended_action}")

    if composite.composite_strength >= threshold and composite.direction != "neutral":
        if mode == "paper":
            print(f"\n  Executing paper trade...")
            cmd_parts = composite.recommended_action.split()
            if not composite.recommended_action.startswith("#"):
                result = _vulcan_json(cmd_parts[1:])
                if result.get("ok"):
                    print(f"  Paper trade OK: {result.get('data', {})}")
                else:
                    print(f"  Paper trade failed: {result.get('error')}")

    log_as_sft(composite, log_path)
    return composite


def main() -> None:
    parser = argparse.ArgumentParser(description="Phoenix Perps Signal Agent (Blueprint 4)")
    parser.add_argument("--market", default="SOL", help="Phoenix perp market symbol")
    parser.add_argument("--mode", choices=["observer", "paper"], default="paper")
    parser.add_argument("--rpc-url", default=os.environ.get("RPC_URL", "https://api.mainnet-beta.solana.com"))
    parser.add_argument("--threshold", type=float, default=0.35, help="Min composite strength to act")
    parser.add_argument("--interval", type=int, default=60, help="Seconds between ticks (--loop mode)")
    parser.add_argument("--loop", action="store_true", help="Run continuously")
    parser.add_argument("--log", default="../../../../data/nvidia_signal_log.jsonl")
    args = parser.parse_args()

    log_path = Path(__file__).parent / args.log

    print(f"Phoenix Perps Signal Agent")
    print(f"  market={args.market}  mode={args.mode}  rpc={args.rpc_url}")
    print(f"  threshold={args.threshold}  log={log_path}")

    if not args.loop:
        run_tick(args.market, args.mode, args.rpc_url, args.threshold, log_path)
        return

    print(f"\nRunning every {args.interval}s. Ctrl+C to stop.\n")
    while True:
        try:
            run_tick(args.market, args.mode, args.rpc_url, args.threshold, log_path)
            time.sleep(args.interval)
        except KeyboardInterrupt:
            print("\nStopped.")
            break
        except Exception as e:
            print(f"  ERROR: {e}")
            time.sleep(args.interval)


if __name__ == "__main__":
    main()
