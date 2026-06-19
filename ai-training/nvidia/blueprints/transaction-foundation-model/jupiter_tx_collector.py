"""
Blueprint 1 — Jupiter transaction collector for the Transaction Foundation Model.

Fetches live Jupiter swap transactions via the Jupiter Swap API v2 and
converts them to NeMo CPT format for transaction foundation model pre-training.

Requires: JUPITER_API_KEY (from https://developers.jup.ag/portal)
Optional: RPC_URL (Solana RPC for on-chain tx confirmation reads)

Usage:
    export JUPITER_API_KEY=your-key
    python3 jupiter_tx_collector.py --output ../../../../data/jupiter_txs.jsonl --count 500
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# ── Config ────────────────────────────────────────────────────────────────────

JUPITER_API_KEY   = os.environ.get("JUPITER_API_KEY", "")
RPC_URL           = os.environ.get("RPC_URL", "https://api.mainnet-beta.solana.com")
JUPITER_SWAP_V2   = "https://api.jup.ag/swap/v2"
JUPITER_QUOTE_V6  = "https://quote-api.jup.ag/v6"

KNOWN_PAIRS = [
    ("So11111111111111111111111111111111111111112",    # SOL
     "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", # USDC
     1_000_000_000),   # 1 SOL
    ("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", # USDC
     "So11111111111111111111111111111111111111112",    # SOL
     100_000_000),     # 100 USDC
    ("JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",  # JUP
     "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", # USDC
     10_000_000_000),  # 10k JUP (6 dec)
    ("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", # BONK
     "So11111111111111111111111111111111111111112",    # SOL
     1_000_000_000_000), # 1M BONK (5 dec)
    ("mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",   # mSOL
     "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", # USDC
     1_000_000_000),   # 1 mSOL (9 dec)
]

LABEL_BY_INPUT = {
    "So111": "SOL", "EPjFW": "USDC", "JUPyi": "JUP",
    "DezXA": "BONK", "jtojt": "JTO",
}

WRAP = "<tx_context>\n{}\n</tx_context>"


# ── HTTP helpers ──────────────────────────────────────────────────────────────

def _fetch(url: str, headers: dict | None = None) -> Any:
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except Exception as e:
        return {"error": str(e)}


def _jup_headers() -> dict:
    h: dict = {}
    if JUPITER_API_KEY:
        h["x-api-key"] = JUPITER_API_KEY
    return h


# ── Quote / build fetch ───────────────────────────────────────────────────────

@dataclass
class SwapQuote:
    input_mint: str
    output_mint: str
    in_label: str
    out_label: str
    in_amount: int
    out_amount: int
    price_impact_pct: float
    route_plan: list[str]
    slippage_bps: int
    mode: str        # "v2/build" | "v6/quote"
    raw: dict


def _fetch_quote(
    input_mint: str, output_mint: str, amount: int
) -> SwapQuote | None:
    in_label = next((v for k, v in LABEL_BY_INPUT.items() if input_mint.startswith(k)), input_mint[:8])
    out_label = next((v for k, v in LABEL_BY_INPUT.items() if output_mint.startswith(k)), output_mint[:8])

    if JUPITER_API_KEY:
        # Try v2/build first (full instruction set)
        url = (
            f"{JUPITER_SWAP_V2}/build"
            f"?inputMint={input_mint}&outputMint={output_mint}"
            f"&amount={amount}&slippageBps=50"
            f"&taker=11111111111111111111111111111111"
        )
        r = _fetch(url, headers=_jup_headers())
        mode = "v2/build"
        # Fall back to v6/quote if v2/build returns no outAmount
        if "error" in r or not r.get("outAmount"):
            url = (
                f"{JUPITER_QUOTE_V6}/quote"
                f"?inputMint={input_mint}&outputMint={output_mint}"
                f"&amount={amount}&slippageBps=50"
            )
            r = _fetch(url, headers=_jup_headers())
            mode = "v6/quote"
    else:
        url = (
            f"{JUPITER_QUOTE_V6}/quote"
            f"?inputMint={input_mint}&outputMint={output_mint}"
            f"&amount={amount}&slippageBps=50"
        )
        r = _fetch(url)
        mode = "v6/quote"

    if "error" in r or not r.get("outAmount"):
        return None

    route_plan = [
        step.get("swapInfo", {}).get("label", "?")
        for step in r.get("routePlan", [])[:5]
    ]

    return SwapQuote(
        input_mint=input_mint,
        output_mint=output_mint,
        in_label=in_label,
        out_label=out_label,
        in_amount=amount,
        out_amount=int(r.get("outAmount", 0)),
        price_impact_pct=float(r.get("priceImpactPct", 0)),
        route_plan=route_plan,
        slippage_bps=50,
        mode=mode,
        raw=r,
    )


# ── CPT record builder ────────────────────────────────────────────────────────

def _quote_to_cpt(q: SwapQuote) -> dict:
    ts = datetime.now(timezone.utc).isoformat()
    route_str = " → ".join(q.route_plan) if q.route_plan else "direct"
    text = (
        f"Jupiter swap quote [{ts}]\n"
        f"Route: {q.in_label} → {q.out_label} via {route_str} ({q.mode})\n"
        f"Input:  {q.in_amount} raw units of {q.in_label} ({q.input_mint})\n"
        f"Output: {q.out_amount} raw units of {q.out_label} ({q.output_mint})\n"
        f"Slippage: {q.slippage_bps} bps\n"
        f"Price impact: {q.price_impact_pct:.4f}%\n"
        f"Min output: {q.raw.get('otherAmountThreshold', 'N/A')}\n"
    )

    # If v2/build returned instructions, summarize them
    if q.mode == "v2/build":
        n_setup = len(q.raw.get("setupInstructions", []))
        has_cleanup = q.raw.get("cleanupInstruction") is not None
        tip = q.raw.get("tipInstruction") is not None
        text += (
            f"Instructions: {n_setup} setup + 1 swap"
            + (" + 1 cleanup" if has_cleanup else "")
            + (" + tip" if tip else "")
            + "\n"
        )

    return {"text": WRAP.format(text)}


# ── Collector ─────────────────────────────────────────────────────────────────

def collect(output_path: Path, count: int = 500, delay: float = 0.5) -> int:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    written = 0
    pairs_cycle = KNOWN_PAIRS.copy()

    print(f"[jupiter-collector] target={count}  key={'yes' if JUPITER_API_KEY else 'no'}  → {output_path}")

    with output_path.open("a") as f:
        while written < count:
            for in_mint, out_mint, amount in pairs_cycle:
                if written >= count:
                    break
                q = _fetch_quote(in_mint, out_mint, amount)
                if q:
                    record = _quote_to_cpt(q)
                    f.write(json.dumps(record) + "\n")
                    written += 1
                    print(f"  [{written}/{count}] {q.in_label}→{q.out_label}  impact={q.price_impact_pct:.3f}%  route={q.route_plan}")
                else:
                    print(f"  skip {in_mint[:8]}→{out_mint[:8]} (no quote)")
                time.sleep(delay)

    print(f"[jupiter-collector] done — {written} records written to {output_path}")
    return written


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=str(Path(__file__).parents[4] / "ai-training" / "data" / "jupiter_txs.jsonl"))
    parser.add_argument("--count", type=int, default=500)
    parser.add_argument("--delay", type=float, default=0.5)
    args = parser.parse_args()
    collect(Path(args.output), args.count, args.delay)
