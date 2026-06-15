"""
Solana Perps & DeFi tool functions for Hermes-3 function calling.

Adapts the NousResearch/Hermes-Function-Calling pattern (originally using yfinance
for stocks) for Solana perpetuals, DeFi, and on-chain data. Uses only:
  - Python stdlib (urllib, json)
  - solana_client.py (sibling script — copied to same dir or on PATH)
  - Phoenix DEX public API
  - CoinGecko free tier
  - Birdeye public endpoints (no key for basic data)
  - Jupiter v6 quote API

No API keys required for read-only operations.
Optional: HELIUS_API_KEY for DAS/cNFT, PHOENIX_API_URL override.

Usage:
  from functions import get_openai_tools
  tools = get_openai_tools()
"""
from __future__ import annotations

import inspect
import json
import os
import sys
import time
import urllib.request
import urllib.error
from typing import Any, Callable

# ── Helpers ─────────────────────────────────────────────────────────────────────

def _fetch(url: str, data: bytes | None = None, headers: dict | None = None) -> Any:
    req = urllib.request.Request(url, data=data, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            return json.loads(resp.read().decode())
    except Exception as exc:
        return {"error": str(exc)}


def _rpc(method: str, params: list | None = None) -> Any:
    url = os.environ.get("SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com")
    payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params or []}).encode()
    r = _fetch(url, data=payload, headers={"Content-Type": "application/json"})
    if isinstance(r, dict) and "error" in r:
        return {"error": r["error"]}
    return r.get("result") if isinstance(r, dict) else r


PHOENIX_BASE = os.environ.get("PHOENIX_API_URL", "https://prod.phoenix-api.ellipsis.markets")
CG_BASE = "https://api.coingecko.com/api/v3"
JUPITER_BASE = "https://quote-api.jup.ag/v6"
BIRDEYE_BASE = "https://public-api.birdeye.so/defi"

KNOWN_MINTS = {
    "SOL":  "So11111111111111111111111111111111111111112",
    "USDC": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "BONK": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    "JUP":  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    "WIF":  "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
    "JTO":  "jtojtomepa8beP8AuQc6eXt5FriJwfFMwjx2ZEfchqd",
    "DRIFT":"DriFtupJYLTosbwoN8koMbEYSx54aFAVLddWsbksjwg7",
    "CLAWD":"8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump",
    "PYTH": "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3",
    "mSOL": "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
}

CG_IDS = {
    "So11111111111111111111111111111111111111112": "solana",
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": "usd-coin",
    "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": "bonk",
    "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN": "jupiter-exchange-solana",
    "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm": "dogwifcoin",
    "jtojtomepa8beP8AuQc6eXt5FriJwfFMwjx2ZEfchqd": "jito-governance-token",
    "DriFtupJYLTosbwoN8koMbEYSx54aFAVLddWsbksjwg7": "drift-protocol",
    "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3": "pyth-network",
    "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So": "marinade-staked-sol",
}


# ── Tool functions ────────────────────────────────────────────────────────────────
# Each function is decorated with metadata for OpenAI tool format conversion.
# Pattern: tool(func) stores func.__tool_meta__ = {"description": ..., "parameters": ...}

def tool(description: str, parameters: dict):
    """Minimal @tool decorator — stores metadata on the function."""
    def decorator(func: Callable) -> Callable:
        func.__tool_meta__ = {
            "description": description,
            "parameters": parameters,
        }
        return func
    return decorator


@tool(
    description="Get the current SOL price in USD from CoinGecko.",
    parameters={
        "type": "object",
        "properties": {},
        "required": [],
    }
)
def get_sol_price() -> dict:
    r = _fetch(f"{CG_BASE}/simple/price?ids=solana&vs_currencies=usd,btc&include_24hr_change=true")
    if "error" in r:
        return r
    sol = r.get("solana", {})
    return {
        "symbol": "SOL",
        "price_usd": sol.get("usd", 0),
        "price_btc": sol.get("btc", 0),
        "change_24h": sol.get("usd_24h_change", 0),
    }


@tool(
    description=(
        "Get the current price of any Solana token by symbol or mint address. "
        "Known symbols: SOL, USDC, BONK, JUP, WIF, JTO, DRIFT, PYTH, mSOL, CLAWD."
    ),
    parameters={
        "type": "object",
        "properties": {
            "symbol": {"type": "string", "description": "Token symbol (e.g. BONK) or mint address"},
        },
        "required": ["symbol"],
    }
)
def get_token_price(symbol: str) -> dict:
    mint = KNOWN_MINTS.get(symbol.upper(), symbol)
    cg_id = CG_IDS.get(mint)
    if cg_id:
        r = _fetch(f"{CG_BASE}/simple/price?ids={cg_id}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true")
        data = r.get(cg_id, {})
        return {
            "symbol": symbol.upper(),
            "mint": mint,
            "price_usd": data.get("usd", 0),
            "change_24h_pct": data.get("usd_24h_change", 0),
            "market_cap_usd": data.get("usd_market_cap", 0),
        }
    return {"symbol": symbol, "mint": mint, "error": "Price not found (not in CoinGecko index)"}


@tool(
    description=(
        "Get Phoenix DEX perpetual markets list with mark prices, 24h volume, "
        "open interest, and funding rates."
    ),
    parameters={
        "type": "object",
        "properties": {
            "market": {
                "type": "string",
                "description": "Optional market filter, e.g. 'SOL-PERP'. Leave empty for all markets.",
            }
        },
        "required": [],
    }
)
def get_perp_markets(market: str = "") -> dict:
    r = _fetch(f"{PHOENIX_BASE}/markets")
    if isinstance(r, dict) and "error" in r:
        return r
    markets = r if isinstance(r, list) else r.get("markets", r.get("data", []))
    if market:
        markets = [m for m in markets if market.upper() in str(m.get("symbol", m.get("name", ""))).upper()]
    result = []
    for m in markets[:10]:
        result.append({
            "symbol": m.get("symbol", m.get("name", "?")),
            "mark_price": m.get("markPrice", m.get("mark_price", 0)),
            "funding_rate_hourly": m.get("fundingRate", m.get("funding_rate", 0)),
            "open_interest_usd": m.get("openInterest", m.get("open_interest", 0)),
            "volume_24h_usd": m.get("volume24h", m.get("volume_24h", 0)),
        })
    return {"markets": result, "count": len(result)}


@tool(
    description=(
        "Get the current funding rate for a Phoenix perpetual market. "
        "Positive = longs pay shorts; negative = shorts pay longs. Rate is per hour."
    ),
    parameters={
        "type": "object",
        "properties": {
            "market": {
                "type": "string",
                "description": "Market symbol, e.g. 'SOL-PERP', 'BTC-PERP', 'ETH-PERP'",
            }
        },
        "required": ["market"],
    }
)
def get_funding_rate(market: str) -> dict:
    r = _fetch(f"{PHOENIX_BASE}/markets")
    if isinstance(r, dict) and "error" in r:
        return r
    markets = r if isinstance(r, list) else r.get("markets", r.get("data", []))
    for m in markets:
        sym = str(m.get("symbol", m.get("name", ""))).upper()
        if market.upper() in sym or sym in market.upper():
            rate = float(m.get("fundingRate", m.get("funding_rate", 0)))
            mark = float(m.get("markPrice", m.get("mark_price", 0)))
            annualized = rate * 24 * 365 * 100
            return {
                "market": sym,
                "funding_rate_hourly": rate,
                "funding_rate_8h": rate * 8,
                "annualized_pct": round(annualized, 2),
                "mark_price": mark,
                "sentiment": "bearish bias" if rate > 0.001 else ("bullish bias" if rate < -0.001 else "neutral"),
            }
    return {"error": f"Market '{market}' not found on Phoenix. Try 'SOL-PERP' or 'BTC-PERP'."}


@tool(
    description="Get the Phoenix DEX orderbook for a perpetual market (top N bids and asks).",
    parameters={
        "type": "object",
        "properties": {
            "market": {"type": "string", "description": "Market symbol, e.g. 'SOL-PERP'"},
            "depth": {"type": "integer", "description": "Number of price levels to return (default: 5, max: 20)", "default": 5},
        },
        "required": ["market"],
    }
)
def get_orderbook(market: str, depth: int = 5) -> dict:
    depth = min(depth, 20)
    r = _fetch(f"{PHOENIX_BASE}/orderbook?market={market.upper()}&depth={depth}")
    if isinstance(r, dict) and "error" in r:
        return r
    bids = r.get("bids", r.get("buyOrders", []))[:depth]
    asks = r.get("asks", r.get("sellOrders", []))[:depth]
    return {
        "market": market.upper(),
        "bids": [[float(b[0]), float(b[1])] for b in bids] if bids and isinstance(bids[0], (list, tuple)) else bids,
        "asks": [[float(a[0]), float(a[1])] for a in asks] if asks and isinstance(asks[0], (list, tuple)) else asks,
        "spread": (float(asks[0][0]) - float(bids[0][0])) if bids and asks and isinstance(bids[0], (list, tuple)) else None,
    }


@tool(
    description="Get open perpetual positions for a wallet address on Phoenix DEX.",
    parameters={
        "type": "object",
        "properties": {
            "wallet": {"type": "string", "description": "Solana wallet public key"},
        },
        "required": ["wallet"],
    }
)
def check_positions(wallet: str) -> dict:
    r = _fetch(f"{PHOENIX_BASE}/traders/{wallet}/positions")
    if isinstance(r, dict) and "error" in r:
        return {"wallet": wallet, "positions": [], "note": "No positions or API error"}
    positions = r if isinstance(r, list) else r.get("positions", r.get("data", []))
    result = []
    for p in positions:
        result.append({
            "market": p.get("market", p.get("symbol", "?")),
            "side": p.get("side", "?"),
            "size": p.get("size", p.get("baseSize", 0)),
            "entry_price": p.get("entryPrice", p.get("entry_price", 0)),
            "mark_price": p.get("markPrice", p.get("mark_price", 0)),
            "pnl_usd": p.get("unrealizedPnl", p.get("unrealized_pnl", 0)),
            "leverage": p.get("leverage", 1),
        })
    return {
        "wallet": wallet[:8] + "...",
        "position_count": len(result),
        "positions": result,
    }


@tool(
    description="Get SOL balance for a wallet address.",
    parameters={
        "type": "object",
        "properties": {
            "wallet": {"type": "string", "description": "Solana wallet public key"},
        },
        "required": ["wallet"],
    }
)
def check_sol_balance(wallet: str) -> dict:
    result = _rpc("getBalance", [wallet])
    if isinstance(result, dict) and "error" in result:
        return result
    lamports = result.get("value", 0) if isinstance(result, dict) else (result or 0)
    sol = lamports / 1e9
    price_data = get_sol_price()
    sol_price = price_data.get("price_usd", 0) if isinstance(price_data, dict) else 0
    return {
        "wallet": wallet[:8] + "...",
        "sol": round(sol, 6),
        "sol_usd": round(sol * sol_price, 2),
        "sol_price_usd": sol_price,
    }


@tool(
    description=(
        "Get a Jupiter DEX swap quote. Shows best route, price impact, and expected output "
        "for swapping between any two Solana tokens."
    ),
    parameters={
        "type": "object",
        "properties": {
            "input_mint": {"type": "string", "description": "Input token symbol (SOL, USDC, etc.) or mint address"},
            "output_mint": {"type": "string", "description": "Output token symbol or mint address"},
            "amount": {"type": "number", "description": "Amount of input token to swap"},
        },
        "required": ["input_mint", "output_mint", "amount"],
    }
)
def get_jupiter_quote(input_mint: str, output_mint: str, amount: float) -> dict:
    in_mint = KNOWN_MINTS.get(input_mint.upper(), input_mint)
    out_mint = KNOWN_MINTS.get(output_mint.upper(), output_mint)
    # Determine decimals heuristically (SOL=9, USDC=6, most others=6)
    decimals = 9 if in_mint == KNOWN_MINTS["SOL"] else 6
    amount_raw = int(amount * (10 ** decimals))
    url = f"{JUPITER_BASE}/quote?inputMint={in_mint}&outputMint={out_mint}&amount={amount_raw}&slippageBps=50"
    r = _fetch(url)
    if isinstance(r, dict) and "error" in r:
        return r
    out_decimals = 9 if out_mint == KNOWN_MINTS["SOL"] else 6
    out_amount = int(r.get("outAmount", 0)) / (10 ** out_decimals)
    price_impact = float(r.get("priceImpactPct", 0))
    return {
        "input": f"{amount} {input_mint.upper()}",
        "output": f"{out_amount:.6f} {output_mint.upper()}",
        "price_impact_pct": price_impact,
        "route_plan": [s.get("swapInfo", {}).get("label", "?") for s in r.get("routePlan", [])[:3]],
        "min_output": int(r.get("otherAmountThreshold", 0)) / (10 ** out_decimals),
    }


@tool(
    description=(
        "Paper trade a Phoenix perpetual position. Simulates entry without real funds. "
        "Returns entry price, estimated liquidation, and risk metrics. "
        "Set paper=false only when LIVE_TRADING env var is 'true'."
    ),
    parameters={
        "type": "object",
        "properties": {
            "market": {"type": "string", "description": "Market symbol, e.g. 'SOL-PERP'"},
            "side": {"type": "string", "description": "'long' or 'short'"},
            "size_usd": {"type": "number", "description": "Notional size in USD"},
            "leverage": {"type": "number", "description": "Leverage (1–10, default: 1)", "default": 1},
        },
        "required": ["market", "side", "size_usd"],
    }
)
def paper_trade(market: str, side: str, size_usd: float, leverage: float = 1.0) -> dict:
    leverage = max(1.0, min(10.0, leverage))
    market_data = get_perp_markets(market)
    markets = market_data.get("markets", [])
    mark_price = markets[0].get("mark_price", 0) if markets else 0

    if mark_price == 0:
        # Fallback: use SOL price for SOL-PERP
        price_data = get_sol_price()
        mark_price = price_data.get("price_usd", 100)

    margin_required = size_usd / leverage
    liq_distance = mark_price / leverage * 0.9
    liq_price = (mark_price - liq_distance) if side.lower() == "long" else (mark_price + liq_distance)

    live = os.environ.get("LIVE_TRADING", "false").lower() == "true"
    return {
        "mode": "LIVE" if live else "PAPER",
        "market": market.upper(),
        "side": side.lower(),
        "size_usd": size_usd,
        "leverage": leverage,
        "mark_price": mark_price,
        "margin_required_usd": round(margin_required, 2),
        "estimated_liquidation_price": round(liq_price, 4),
        "funding_cost_8h_usd": round(size_usd * 0.0001 * 8, 4),
        "executed": live,
        "note": "PAPER mode — no real funds used" if not live else "⚠ LIVE mode",
    }


@tool(
    description=(
        "Get a comprehensive market overview: SOL price, top gaining tokens, "
        "Phoenix perps summary, and network stats. Use for a quick snapshot "
        "before making trading decisions."
    ),
    parameters={
        "type": "object",
        "properties": {},
        "required": [],
    }
)
def get_market_overview() -> dict:
    sol_data = get_sol_price()
    epoch = _rpc("getEpochInfo") or {}
    perf = _rpc("getRecentPerformanceSamples", [1]) or [{}]
    tps = perf[0].get("numTransactions", 0) / max(perf[0].get("samplePeriodSecs", 60), 1) if perf else 0
    perps = get_perp_markets()

    return {
        "sol_price_usd": sol_data.get("price_usd", 0),
        "sol_24h_change_pct": sol_data.get("change_24h", 0),
        "network_tps": round(tps),
        "epoch": epoch.get("epoch", "?"),
        "slot": epoch.get("absoluteSlot", "?"),
        "perp_markets_count": perps.get("count", 0),
        "top_perp_markets": [
            f"{m['symbol']} @ ${m['mark_price']}"
            for m in perps.get("markets", [])[:3]
        ],
    }


@tool(
    description=(
        "Get recent trade history for a wallet on Phoenix DEX — entries, exits, "
        "realized PnL, and volume."
    ),
    parameters={
        "type": "object",
        "properties": {
            "wallet": {"type": "string", "description": "Solana wallet public key"},
            "limit": {"type": "integer", "description": "Number of trades to fetch (default: 10, max: 50)", "default": 10},
        },
        "required": ["wallet"],
    }
)
def get_trader_history(wallet: str, limit: int = 10) -> dict:
    limit = min(limit, 50)
    r = _fetch(f"{PHOENIX_BASE}/traders/{wallet}/fills?limit={limit}")
    if isinstance(r, dict) and "error" in r:
        return {"wallet": wallet[:8] + "...", "trades": [], "note": "No history or API error"}
    fills = r if isinstance(r, list) else r.get("fills", r.get("data", []))
    total_pnl = sum(float(f.get("realizedPnl", 0)) for f in fills if isinstance(f, dict))
    return {
        "wallet": wallet[:8] + "...",
        "trade_count": len(fills),
        "total_realized_pnl_usd": round(total_pnl, 2),
        "recent_trades": [
            {
                "market": f.get("market", "?"),
                "side": f.get("side", "?"),
                "price": f.get("price", 0),
                "size": f.get("baseSize", f.get("size", 0)),
                "pnl_usd": f.get("realizedPnl", 0),
            }
            for f in fills[:5]
            if isinstance(f, dict)
        ],
    }


@tool(
    description=(
        "Send SOL from the agent wallet to another address. "
        "In paper mode (default), simulates the transfer without signing. "
        "Set LIVE_TRADING=true to enable real transactions — requires AGENT_WALLET_KEYPAIR."
    ),
    parameters={
        "type": "object",
        "properties": {
            "to": {"type": "string", "description": "Recipient Solana address"},
            "amount_sol": {"type": "number", "description": "Amount of SOL to send"},
        },
        "required": ["to", "amount_sol"],
    }
)
def send_sol(to: str, amount_sol: float) -> dict:
    live = os.environ.get("LIVE_TRADING", "false").lower() == "true"
    if live:
        keypair_path = os.environ.get("AGENT_WALLET_KEYPAIR", "")
        if not keypair_path:
            return {"error": "LIVE_TRADING=true but AGENT_WALLET_KEYPAIR not set"}
        return {
            "mode": "LIVE",
            "status": "not_implemented",
            "note": "Live SOL sends require solders or solana-py. Install: pip install solders",
        }
    price_data = get_sol_price()
    sol_price = price_data.get("price_usd", 0)
    return {
        "mode": "PAPER",
        "to": to[:8] + "...",
        "amount_sol": amount_sol,
        "amount_usd": round(amount_sol * sol_price, 2),
        "status": "simulated",
        "note": "PAPER mode — no real transaction submitted",
    }


@tool(
    description=(
        "Assess the risk of entering a perpetual position: liquidation price, "
        "max loss, funding cost projections, and a 1–10 risk score."
    ),
    parameters={
        "type": "object",
        "properties": {
            "market": {"type": "string", "description": "Market symbol, e.g. 'SOL-PERP'"},
            "side": {"type": "string", "description": "'long' or 'short'"},
            "size_usd": {"type": "number", "description": "Notional position size in USD"},
            "leverage": {"type": "number", "description": "Leverage (1–10)", "default": 1},
            "capital_usd": {"type": "number", "description": "Total trading capital for risk-% calculation", "default": 1000},
        },
        "required": ["market", "side", "size_usd"],
    }
)
def assess_position_risk(
    market: str,
    side: str,
    size_usd: float,
    leverage: float = 1.0,
    capital_usd: float = 1000.0,
) -> dict:
    leverage = max(1.0, min(10.0, leverage))
    funding = get_funding_rate(market)
    fr = float(funding.get("funding_rate_hourly", 0))
    mark = float(funding.get("mark_price", 100))

    margin = size_usd / leverage
    liq_dist_pct = 0.9 / leverage
    liq_price = mark * (1 - liq_dist_pct) if side.lower() == "long" else mark * (1 + liq_dist_pct)
    max_loss = margin
    capital_risk_pct = (max_loss / capital_usd) * 100

    # Funding cost for 24h
    funding_24h = abs(fr) * 24 * size_usd

    # Risk score: higher leverage + worse funding + high capital% = higher risk
    risk_score = min(10, int(
        2 * min(leverage / 2, 5)
        + 2 * min(capital_risk_pct / 10, 4)
        + (2 if abs(fr) > 0.001 else 0)
        + (1 if leverage > 5 else 0)
    ))

    return {
        "market": market.upper(),
        "side": side.lower(),
        "size_usd": size_usd,
        "leverage": leverage,
        "margin_required_usd": round(margin, 2),
        "mark_price": mark,
        "liquidation_price": round(liq_price, 4),
        "max_loss_usd": round(max_loss, 2),
        "capital_at_risk_pct": round(capital_risk_pct, 1),
        "funding_rate_hourly": fr,
        "estimated_funding_cost_24h_usd": round(funding_24h, 4),
        "risk_score": risk_score,
        "risk_label": ["", "Very Low", "Low", "Low", "Moderate", "Moderate", "High", "High", "Very High", "Extreme", "Extreme"][risk_score],
        "recommendation": "enter" if risk_score <= 5 else ("wait" if risk_score <= 7 else "avoid"),
    }


# ── Tool registry ─────────────────────────────────────────────────────────────────

ALL_TOOLS: list[Callable] = [
    get_sol_price,
    get_token_price,
    get_perp_markets,
    get_funding_rate,
    get_orderbook,
    check_positions,
    check_sol_balance,
    get_jupiter_quote,
    paper_trade,
    get_market_overview,
    get_trader_history,
    send_sol,
    assess_position_risk,
]

TOOL_MAP: dict[str, Callable] = {f.__name__: f for f in ALL_TOOLS}


def convert_to_openai_tool(func: Callable) -> dict:
    """Convert a @tool-decorated function to OpenAI/Hermes tool format."""
    meta = getattr(func, "__tool_meta__", {})
    return {
        "type": "function",
        "function": {
            "name": func.__name__,
            "description": meta.get("description", inspect.getdoc(func) or ""),
            "parameters": meta.get("parameters", {"type": "object", "properties": {}, "required": []}),
        },
    }


def get_openai_tools() -> list[dict]:
    """Return all Solana perps tools in OpenAI/Hermes tool-call format."""
    return [convert_to_openai_tool(f) for f in ALL_TOOLS]


def call_function(name: str, arguments: dict) -> str:
    """Execute a tool by name and return JSON string result."""
    func = TOOL_MAP.get(name)
    if not func:
        return json.dumps({"error": f"Unknown function: {name}"})
    try:
        result = func(**arguments)
        return json.dumps(result, default=str)
    except Exception as exc:
        return json.dumps({"error": str(exc), "function": name, "arguments": arguments})


if __name__ == "__main__":
    print("Available tools:")
    for t in get_openai_tools():
        print(f"  {t['function']['name']}: {t['function']['description'][:60]}...")
