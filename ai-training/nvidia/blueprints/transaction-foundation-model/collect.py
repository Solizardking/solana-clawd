"""
Blueprint 1 — Multi-source CPT data collector.

Aggregates transaction-domain text from:
  1. Jupiter Swap API v2  (live swap routes + instruction metadata)
  2. Phoenix perps via RPC (funding rates, market stats)
  3. Existing SFT JSONL   (messages → CPT text conversion)
  4. DeepSolana corpus    (if data/deep_solana_corpus.jsonl present)
  5. BigQuery mainnet     (bigquery-public-data.crypto_solana_mainnet_us DEX swaps)

All sources emit {"text": "<tx_context>...</tx_context>"} records.

Usage:
    python3 collect.py --output ../../../../data/tx_foundation_cpt.jsonl --count 2000
    python3 collect.py --sources jupiter rpc sft bigquery --count 10000 --dry-run
    python3 collect.py --sources bigquery --count 50000   # BQ-only bulk pull
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from tx_foundation_common import DATA_DIR as DATA

# BigQuery source (optional — falls back to mock if google-cloud-bigquery not installed)
try:
    from bigquery_collector import collect_bigquery as _bq_collect  # type: ignore
    _BQ_AVAILABLE = True
except Exception:
    _BQ_AVAILABLE = False
    def _bq_collect(count: int, out: list[str]) -> int:  # type: ignore[misc]
        print("  [bigquery] google-cloud-bigquery not installed — skipping", file=sys.stderr)
        return 0

# ── Shared ─────────────────────────────────────────────────────────────────────

WRAP = "<tx_context>\n{}\n</tx_context>"
JUPITER_API_KEY = os.environ.get("JUPITER_API_KEY", "")
RPC_URL = os.environ.get("RPC_URL", "https://api.mainnet-beta.solana.com")
PHOENIX_BASE = os.environ.get("PHOENIX_API_URL", "https://prod.phoenix-api.ellipsis.markets")

# ── HTTP helpers ───────────────────────────────────────────────────────────────

def _get(url: str, headers: dict | None = None) -> dict:
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except Exception as e:
        return {"error": str(e)}


def _rpc(method: str, params: list | None = None) -> dict:
    payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params or []}).encode()
    req = urllib.request.Request(RPC_URL, data=payload, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            d = json.loads(r.read())
            return d.get("result", {})
    except Exception as e:
        return {"error": str(e)}


def _jup_headers() -> dict:
    return {"x-api-key": JUPITER_API_KEY} if JUPITER_API_KEY else {}


# ── Source 1: Jupiter swap quotes ─────────────────────────────────────────────

JUPITER_PAIRS = [
    ("So11111111111111111111111111111111111111112",    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", 1_000_000_000,  "SOL",  "USDC"),
    ("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "So11111111111111111111111111111111111111112",    100_000_000,    "USDC", "SOL"),
    ("JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", 10_000_000_000, "JUP",  "USDC"),
    ("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", "So11111111111111111111111111111111111111112",    1_000_000_000_000, "BONK","SOL"),
    ("mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", 1_000_000_000,  "mSOL", "USDC"),
    ("8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", 1_000_000_000_000, "CLAWD","USDC"),
]

QUOTE_V6 = "https://quote-api.jup.ag/v6"
SWAP_V2  = "https://api.jup.ag/swap/v2"


def _jupiter_quote(in_mint, out_mint, amount, in_lbl, out_lbl) -> str | None:
    if JUPITER_API_KEY:
        r = _get(
            f"{SWAP_V2}/build?inputMint={in_mint}&outputMint={out_mint}"
            f"&amount={amount}&slippageBps=50&taker=11111111111111111111111111111111",
            headers=_jup_headers(),
        )
        mode = "v2/build"
        if "error" in r or not r.get("outAmount"):
            r = _get(f"{QUOTE_V6}/quote?inputMint={in_mint}&outputMint={out_mint}&amount={amount}&slippageBps=50",
                     headers=_jup_headers())
            mode = "v6/quote"
    else:
        r = _get(f"{QUOTE_V6}/quote?inputMint={in_mint}&outputMint={out_mint}&amount={amount}&slippageBps=50")
        mode = "v6/quote"

    if "error" in r or not r.get("outAmount"):
        return None

    route = " → ".join(s.get("swapInfo", {}).get("label", "?") for s in r.get("routePlan", [])[:5])
    out_amt = r.get("outAmount", 0)
    impact  = float(r.get("priceImpactPct", 0))
    min_out = r.get("otherAmountThreshold", "N/A")
    ts = datetime.now(timezone.utc).isoformat()

    parts = [
        f"Jupiter swap [{ts}] mode={mode}",
        f"Route: {in_lbl} → {out_lbl} via {route}",
        f"Input:  {amount} raw {in_lbl} ({in_mint})",
        f"Output: {out_amt} raw {out_lbl} ({out_mint})",
        f"Price impact: {impact:.4f}%   Min output: {min_out}",
    ]
    if mode == "v2/build":
        n_setup = len(r.get("setupInstructions", []))
        has_clean = r.get("cleanupInstruction") is not None
        parts.append(f"Instructions: {n_setup} setup + 1 swap" + (" + cleanup" if has_clean else ""))

    return WRAP.format("\n".join(parts))


def collect_jupiter(count: int, out: list[str]) -> int:
    written = 0
    cycle = list(JUPITER_PAIRS)
    while written < count:
        for pair in cycle:
            if written >= count:
                break
            rec = _jupiter_quote(*pair)
            if rec:
                out.append(json.dumps({"text": rec}))
                written += 1
            time.sleep(0.2)
    return written


# ── Source 2: Phoenix/RPC market data ─────────────────────────────────────────

PERP_MARKETS = ["SOL-PERP", "BTC-PERP", "ETH-PERP", "JTO-PERP", "JUP-PERP"]


def _phoenix_record(market: str) -> str | None:
    r = _get(f"{PHOENIX_BASE}/perps/markets/{market.lower()}")
    if "error" in r:
        return None
    ts = datetime.now(timezone.utc).isoformat()
    mark   = r.get("mark_price", r.get("markPrice", "N/A"))
    fund   = r.get("funding_rate", r.get("fundingRate", "N/A"))
    oi     = r.get("open_interest", r.get("openInterest", "N/A"))
    vol24  = r.get("volume_24h", r.get("volume24h", "N/A"))
    return WRAP.format(
        f"Phoenix perp market [{ts}]\n"
        f"Market: {market}\n"
        f"Mark price: {mark}   Funding rate: {fund}\n"
        f"Open interest: {oi}   24h volume: {vol24}"
    )


def _sol_slot() -> str | None:
    r = _rpc("getSlot")
    if isinstance(r, (int, float)):
        return WRAP.format(f"Solana slot [{datetime.now(timezone.utc).isoformat()}]\nCurrent slot: {r}")
    return None


def collect_rpc(count: int, out: list[str]) -> int:
    written = 0
    while written < count:
        for mkt in PERP_MARKETS:
            if written >= count:
                break
            rec = _phoenix_record(mkt)
            if rec:
                out.append(json.dumps({"text": rec}))
                written += 1
            time.sleep(0.1)
        slot_rec = _sol_slot()
        if slot_rec and written < count:
            out.append(json.dumps({"text": slot_rec}))
            written += 1
    return written


# ── Source 3: Existing SFT JSONL → CPT ────────────────────────────────────────

import re
TX_KW = re.compile(
    r"(signature|lamport|blockhash|pubkey|instruction|account|PDA|SPL|"
    r"transfer|swap|mint|burn|stake|vote|CPI|program|slot|epoch|"
    r"perp|funding|liquidat|orderbook|phoenix|jupiter|margin|solana)",
    re.IGNORECASE,
)

SFT_SOURCES = [
    DATA / "solana_clawd_merged.jsonl",
    DATA / "nvidia_trading_factory_sft.jsonl",
    DATA / "realtime_research_sft.jsonl",
]


def _sft_to_cpt(obj: dict) -> str | None:
    messages = obj.get("messages", [])
    parts = [m.get("content", "").strip() for m in messages
             if m.get("role") in ("user", "assistant") and m.get("content", "").strip()]
    joined = "\n\n".join(parts)
    if TX_KW.search(joined):
        return WRAP.format(joined)
    return None


def collect_sft(count: int, out: list[str]) -> int:
    written = 0
    for src in SFT_SOURCES:
        if written >= count or not src.exists():
            continue
        with src.open() as f:
            for line in f:
                if written >= count:
                    break
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                    # Pass through pre-built CPT records
                    if "text" in obj and TX_KW.search(obj["text"]):
                        out.append(json.dumps({"text": obj["text"]}))
                        written += 1
                        continue
                    rec = _sft_to_cpt(obj)
                    if rec:
                        out.append(json.dumps({"text": rec}))
                        written += 1
                except json.JSONDecodeError:
                    continue
    return written


# ── Source 4: DeepSolana corpus ────────────────────────────────────────────────

DEEPSOL = DATA / "deep_solana_corpus.jsonl"


def collect_deepsol(count: int, out: list[str]) -> int:
    if not DEEPSOL.exists():
        print(f"  [deepsol] not found at {DEEPSOL} — skip")
        return 0
    written = 0
    with DEEPSOL.open() as f:
        for line in f:
            if written >= count:
                break
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                text = obj.get("text", "")
                if text and TX_KW.search(text):
                    out.append(json.dumps({"text": WRAP.format(text[:4096])}))
                    written += 1
            except json.JSONDecodeError:
                continue
    return written


# ── Main ───────────────────────────────────────────────────────────────────────

def collect_bigquery(count: int, out: list[str]) -> int:
    return _bq_collect(count, out)


SOURCES = {
    "jupiter":   collect_jupiter,
    "rpc":       collect_rpc,
    "sft":       collect_sft,
    "deepsol":   collect_deepsol,
    "bigquery":  collect_bigquery,
}


def collect_all(
    sources: list[str],
    output_path: Path,
    count: int,
    dry_run: bool = False,
) -> int:
    per_source = max(1, count // len(sources))
    buf: list[str] = []

    if dry_run:
        print(f"  [DRY RUN] output: {output_path}")
        print(f"  [DRY RUN] target records: {count}")
        print(f"  [DRY RUN] approx per source: {per_source}")
        for src_name in sources:
            print(f"  [DRY RUN] would collect from: {src_name}")
        return 0

    for src_name in sources:
        fn = SOURCES[src_name]
        n = fn(min(per_source + 50, count - len(buf)), buf)
        print(f"  [{src_name}] collected {n}")

    # Trim to exact count
    buf = buf[:count]

    print(f"  total: {len(buf)} records")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w") as f:
        f.write("\n".join(buf) + "\n")
    print(f"  written → {output_path}")
    return len(buf)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=str(DATA / "tx_foundation_cpt.jsonl"))
    parser.add_argument("--count", type=int, default=2000)
    parser.add_argument("--sources", nargs="+",
                        default=["jupiter", "sft", "deepsol", "bigquery"],
                        choices=list(SOURCES.keys()))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    print(f"[tx-collect] sources={args.sources}  count={args.count}")
    collect_all(args.sources, Path(args.output), args.count, args.dry_run)
